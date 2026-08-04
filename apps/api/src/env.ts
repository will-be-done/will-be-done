import { z } from "zod";

const EnvConfigSchema = z.object({
  WBD_STORAGE_PATH: z.string().default("/var/lib/will-be-done"),
  WBD_DB_PATH: z.string().optional(),
  WBD_TASK_GENERATION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
});

let envConfig:
  | {
      WBD_STORAGE_PATH: string;
      WBD_DB_PATH: string;
      WBD_TASK_GENERATION_INTERVAL_MS: number;
    }
  | undefined;

export function getEnvConfig() {
  if (envConfig) return envConfig;

  const parsed = EnvConfigSchema.parse({
    WBD_STORAGE_PATH: process.env.WBD_STORAGE_PATH,
    WBD_DB_PATH: process.env.WBD_DB_PATH,
    WBD_TASK_GENERATION_INTERVAL_MS:
      process.env.WBD_TASK_GENERATION_INTERVAL_MS,
  });

  envConfig = {
    WBD_STORAGE_PATH: parsed.WBD_STORAGE_PATH,
    WBD_DB_PATH: parsed.WBD_DB_PATH ?? `${parsed.WBD_STORAGE_PATH}/db`,
    WBD_TASK_GENERATION_INTERVAL_MS: parsed.WBD_TASK_GENERATION_INTERVAL_MS,
  };

  return envConfig;
}
