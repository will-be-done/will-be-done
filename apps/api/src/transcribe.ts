import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const memosDir = path.join(__dirname, "..", "dbs", "memos");

async function transcribeFile(filePath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const whisper = spawn("whisper", [
      filePath,
      "--model",
      "large",
      "--output_format",
      "txt",
      "--output_dir",
      path.dirname(filePath),
    ]);

    let output = "";
    let error = "";

    whisper.stdout?.on("data", (data) => {
      console.log("whisper(stdout): ", data.toString());
    });

    whisper.stderr?.on("data", (data) => {
      console.log("whisper(stderr): ", data.toString());
    });

    whisper.on("close", (code) => {
      if (code === 0) {
        // Read the generated text file
        const txtFile = filePath.replace(".mp4", ".txt");
        if (fs.existsSync(txtFile)) {
          const transcript = fs.readFileSync(txtFile, "utf8");
          resolve(transcript.trim());
        } else {
          resolve(null);
        }
      } else {
        reject(new Error(`Whisper failed with code ${code}: ${error}`));
      }
    });

    whisper.on("error", reject);
  });
}

async function processTranscriptions() {
  while (true) {
    try {
      if (fs.existsSync(memosDir)) {
        const files = fs.readdirSync(memosDir);

        for (const file of files) {
          if (file.endsWith(".mp4")) {
            const filePath = path.join(memosDir, file);
            const txtFile = filePath.replace(".mp4", ".txt");

            // Skip if already transcribed
            if (fs.existsSync(txtFile)) {
              const transcript = fs.readFileSync(txtFile, "utf8");
              console.log(`Skipping: ${file} - already transcribed. Content:`);
              console.log(transcript);

              continue;
            }

            console.log(`Transcribing: ${file}`);
            const transcript = await transcribeFile(filePath);

            if (transcript) {
              console.log(`Transcript for ${file}:`);
              console.log(transcript);
            } else {
              console.log(`Failed to transcribe: ${file}`);
            }
          }
        }
      }
    } catch (error) {
      console.error("Processing error:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

processTranscriptions();

