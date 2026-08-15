import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { z } from "zod";
import {
  SYNC_VERSION_UNSUPPORTED,
  UnsupportedSyncVersionError,
} from "@will-be-done/slices/common";
import { publicProcedure, router } from "./trpc";
import { assertSupportedSyncVersion } from "./syncVersion";

describe("sync version enforcement", () => {
  it("accepts version 4", () => {
    expect(() => assertSupportedSyncVersion(4)).not.toThrow();
  });

  it.each([undefined, 0, 1, 2, 3])("rejects unsupported version %s", (version) => {
    try {
      assertSupportedSyncVersion(version);
      throw new Error("Expected sync version rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((error as TRPCError).cause).toBeInstanceOf(
        UnsupportedSyncVersionError,
      );
    }
  });

  it("serializes compatibility data from an unsupported router request", async () => {
    const syncRouter = router({
      sync: publicProcedure
        .input(z.object({ syncVersion: z.number().int().optional() }))
        .mutation(({ input }) => {
          assertSupportedSyncVersion(input.syncVersion);
        }),
    });
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request("http://localhost/trpc/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syncVersion: 1 }),
      }),
      router: syncRouter,
      createContext: () => ({ user: null }),
    });
    const body = (await response.json()) as {
      error: {
        data: {
          code: string;
          syncVersion: unknown;
        };
      };
    };

    expect(response.status).toBe(412);
    expect(body.error.data.code).toBe("PRECONDITION_FAILED");
    expect(body.error.data.syncVersion).toEqual({
      code: SYNC_VERSION_UNSUPPORTED,
      received: 1,
      minimum: 4,
      maximum: 4,
    });
  });
});
