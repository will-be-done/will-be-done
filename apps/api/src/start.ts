import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { Database } from "bun:sqlite";
import {
  DB,
  execSync,
  SqlDriver,
  syncDispatch,
  select,
  SubscribableDB,
} from "@will-be-done/hyperdb";
import * as dotenv from "dotenv";
import {
  changesTable,
  projectsSlice2,
  ChangesetArray,
  changesSlice,
  projectItemsSlice2,
  registeredSyncableTables,
} from "@will-be-done/slices";
import fastify from "fastify";
import staticPlugin from "@fastify/static";
import multipart from "@fastify/multipart";
import path from "path";
import fs from "fs";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";
// import "./transcribe";

dotenv.config();

const clientId = "server";
const initClock = (clientId: string) => {
  let now = Date.now();
  let n = 0;

  return () => {
    const newNow = Date.now();

    if (newNow === now) {
      n++;
    } else if (newNow > now) {
      now = newNow;
      n = 0;
    }

    return `${now}-${n.toString().padStart(4, "0")}-${clientId}`;
  };
};
const nextClock = initClock(clientId);

console.log(
  "Loading database...",
  path.join(__dirname, "..", "dbs", "main2.sqlite"),
);
const sqliteDB = new Database(
  path.join(__dirname, "..", "dbs", "main2.sqlite"),
  { strict: true },
);

export type SqlValue = number | string | Uint8Array | null;
const sqliteDriver = new SqlDriver({
  exec(sql: string, params?: SqlValue[]): void {
    if (!params) {
      sqliteDB.run(sql);
    } else {
      sqliteDB.run(sql, params);
    }
  },
  prepare(sql: string) {
    const stmt = sqliteDB.prepare(sql);

    return {
      values(values: SqlValue[]): SqlValue[][] {
        return stmt.values(...values) as SqlValue[][];
      },
      finalize(): void {
        stmt.finalize();
      },
    };
  },
});

const hyperDB = new SubscribableDB(new DB(sqliteDriver));

hyperDB.afterInsert(function* (db, table, traits, ops) {
  if (table === changesTable) return;
  if (traits.some((t) => t.type === "skip-sync")) {
    return;
  }

  for (const op of ops) {
    syncDispatch(
      db,
      changesSlice.insertChangeFromInsert(
        op.table,
        op.newValue,
        clientId,
        nextClock,
      ),
    );
  }

  yield* noop();
});
hyperDB.afterUpdate(function* (db, table, traits, ops) {
  if (table === changesTable) return;
  if (traits.some((t) => t.type === "skip-sync")) {
    return;
  }

  for (const op of ops) {
    syncDispatch(
      db,
      changesSlice.insertChangeFromUpdate(
        op.table,
        op.oldValue,
        op.newValue,
        clientId,
        nextClock,
      ),
    );
  }

  yield* noop();
});
hyperDB.afterDelete(function* (db, table, traits, ops) {
  if (table === changesTable) return;
  if (traits.some((t) => t.type === "skip-sync")) {
    return;
  }

  for (const op of ops) {
    syncDispatch(
      db,
      changesSlice.insertChangeFromDelete(
        op.table,
        op.oldValue,
        clientId,
        nextClock,
      ),
    );
  }

  yield* noop();
});

execSync(hyperDB.loadTables([...registeredSyncableTables, changesTable]));
const inbox = syncDispatch(hyperDB, projectsSlice2.createInboxIfNotExists());
syncDispatch(hyperDB, projectsSlice2.migrateProjectsWithoutCategories());

const appRouter = router({
  getChangesAfter: publicProcedure
    .input(z.object({ lastServerUpdatedAt: z.string() }))
    .query(async (opts) => {
      return select(
        hyperDB,
        changesSlice.getChangesetAfter(opts.input.lastServerUpdatedAt),
      );
    }),
  handleChanges: publicProcedure
    .input(ChangesetArray)
    .mutation(async (opts) => {
      const { input } = opts;

      syncDispatch(
        hyperDB.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(input, nextClock, clientId),
      );
    }),
});

const server = fastify({
  logger: true,
  bodyLimit: 100485760,
});

server.register(staticPlugin, {
  root: path.join(__dirname, "..", "public"),
});

server.register(multipart);

server.register(fastifyTRPCPlugin, {
  prefix: "/api/trpc",
  useWSS: true,
  trpcOptions: {
    router: appRouter,
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
});

server.post("/upload", async (request, reply) => {
  try {
    const parts = request.parts();
    let memoId: string = "";
    let duration: number = 0;
    let createdAt: number = 0;
    let audioBuffer: Buffer | null = null;
    let fileName: string = "";

    for await (const part of parts) {
      if (part.type === "field") {
        const fieldName = part.fieldname;
        const value = part.value as string;

        switch (fieldName) {
          case "memoId":
            memoId = value;
            break;
          case "duration":
            duration = parseFloat(value);
            break;
          case "createdAt":
            createdAt = parseFloat(value);
            break;
        }
      } else if (part.type === "file" && part.fieldname === "audio") {
        fileName = part.filename || `${memoId}.mp4`;
        audioBuffer = await part.toBuffer();
      }
    }

    if (!audioBuffer || !memoId) {
      return reply.code(400).send({ error: "Missing audio file or memoId" });
    }

    const memosDir = path.join(__dirname, "..", "dbs", "memos");
    if (!fs.existsSync(memosDir)) {
      fs.mkdirSync(memosDir, { recursive: true });
    }

    const filePath = path.join(memosDir, `${memoId}.mp4`);
    fs.writeFileSync(filePath, audioBuffer);

    console.log(
      `Saved memo: ${memoId}, duration: ${duration}, file: ${fileName}`,
    );

    return reply.code(200).send({
      success: true,
      memoId,
      fileName,
      duration,
      createdAt: new Date(createdAt * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return reply.code(500).send({ error: "Upload failed" });
  }
});

server.register(async (instance) => {
  instance.addHook("preHandler", async (request, reply) => {
    console.log("preHandler", request.headers);

    if (process.env.NODE_ENV === "development" || request.url === "/upload") {
      return;
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.header("WWW-Authenticate", 'Basic realm="Secure Area"');
      reply.code(401).send({ error: "Unauthorized - Authentication required" });
      return reply;
    }
  });
});

server.addHook("onRequest", async (request, reply) => {
  if (process.env.NODE_ENV === "development" || request.url === "/upload") {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    reply.header("WWW-Authenticate", 'Basic realm="Secure Area"');
    return reply
      .code(401)
      .send({ error: "Unauthorized - Authentication required" });
  }

  const base64Credentials = authHeader.slice(6); // Remove "Basic "

  const credentials = Buffer.from(base64Credentials, "base64").toString(
    "utf-8",
  );

  const [username, password] = credentials.split(":");
  if (
    username === (process.env.AUTH_USERNAME || "") &&
    password === (process.env.AUTH_PASSWORD || "")
  ) {
    console.log("Authentication successful");
    return;
  }

  //   // If we get here, authentication failed
  reply.header("WWW-Authenticate", 'Basic realm="Secure Area"');
  reply.code(401).send({ error: "Authentication failed" });
});

// Register a not found handler that serves index.html for non-API routes
server.setNotFoundHandler((request, reply) => {
  const url = request.url;

  // Skip API routes - return normal 404 for them
  if (url.startsWith("/api")) {
    reply.code(404).send({ error: "Not found" });
    return;
  }

  // For all other routes, serve the index.html
  const indexPath = path.join(__dirname, "..", "public", "index.html");

  // Check if index.html exists
  try {
    if (fs.existsSync(indexPath)) {
      const stream = fs.createReadStream(indexPath);
      reply.type("text/html").send(stream);
    } else {
      reply.code(404).send({ error: "index.html not found" });
    }
  } catch (err) {
    reply.code(500).send({ error: "Server error" });
  }
});

const start = async () => {
  try {
    await server.listen({ port: 3000, host: "0.0.0.0" });

    const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
    for (const signal of signals) {
      process.on(signal, async () => {
        server.log.info(
          `${signal} signal received, shutting down gracefully...`,
        );

        try {
          // Close the Fastify server first
          await server.close();
          server.log.info("Server closed successfully");

          // Then exit the process
          process.exit(0);
        } catch (err) {
          server.log.error(`Error during graceful shutdown: ${err}`);
          process.exit(1);
        }
      });
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

void start();

export type AppRouter = typeof appRouter;

const memosDir = path.join(__dirname, "..", "dbs", "memos");

const createTaskIfNotExists = (memoId: string, content: string) => {
  syncDispatch(
    hyperDB,
    projectItemsSlice2.createTaskIfNotExists(
      inbox.id,
      memoId.toLowerCase(),
      "prepend",
      {
        title: content,
      },
    ),
  );
};

async function transcribeFile(filePath: string): Promise<string | null> {
  try {
    // Create form data for the HTTP request using Bun's built-in FormData
    const formData = new FormData();
    const file = Bun.file(filePath);
    formData.append("audio", file);

    console.log("sending file", filePath);
    // Make HTTP request to transcription service
    const response = await fetch("http://tosi-bosi.com:3284/transcribe", {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    });
    console.log(" file sent", filePath);

    if (!response.ok) {
      throw new Error(
        `Transcription service failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { text: string };
    return result.text?.trim() || null;
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}

async function processTranscriptions() {
  while (true) {
    try {
      if (fs.existsSync(memosDir)) {
        const files = fs.readdirSync(memosDir);

        for (const file of files) {
          if (file.endsWith(".mp4")) {
            const filePath = path.join(memosDir, file);
            const transcriptFile = filePath.replace(".mp4", ".transcript");

            const id = path.basename(file).replace(".mp4", "");
            console.log("id", id);

            // Skip if already transcribed
            if (fs.existsSync(transcriptFile)) {
              const transcript = fs.readFileSync(transcriptFile, "utf8").trim();
              console.log(`Skipping: ${file} - already transcribed. Content:`);
              createTaskIfNotExists(id, transcript);

              // Remove .mp4 and transcript files after task creation
              fs.unlinkSync(filePath);
              fs.unlinkSync(transcriptFile);
              console.log(
                `Removed files: ${file} and ${path.basename(transcriptFile)}`,
              );
              continue;
            }

            console.log(`Transcribing: ${file}`);
            const transcript = await transcribeFile(filePath);

            if (transcript) {
              // Save transcript to avoid re-processing
              fs.writeFileSync(transcriptFile, transcript);

              console.log("==== CREATE TASK ====");
              createTaskIfNotExists(id, transcript);
              console.log("==== CREATE TASK ====");
              console.log(`Transcript for ${file}:`);
              console.log(transcript);

              // Remove .mp4 and transcript files after task creation
              fs.unlinkSync(filePath);
              fs.unlinkSync(transcriptFile);
              console.log(
                `Removed files: ${file} and ${path.basename(transcriptFile)}`,
              );
            } else {
              console.log(`Failed to transcribe: ${file}`);
            }
          }
        }
      } else {
        console.log("memos folder not found");
      }
    } catch (error) {
      console.error("Processing error:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

processTranscriptions();
