import { z } from "zod";

const EnvConfigSchema = z.object({
  WBD_STORAGE_PATH: z.string().default("/var/lib/will-be-done"),
  WBD_DB_PATH: z.string().optional(),
});

let envConfig:
  | { WBD_STORAGE_PATH: string; WBD_DB_PATH: string }
  | undefined;

export function getEnvConfig() {
  if (envConfig) return envConfig;

  const parsed = EnvConfigSchema.parse({
    WBD_STORAGE_PATH: process.env.WBD_STORAGE_PATH,
    WBD_DB_PATH: process.env.WBD_DB_PATH,
  });

  envConfig = {
    WBD_STORAGE_PATH: parsed.WBD_STORAGE_PATH,
    WBD_DB_PATH: parsed.WBD_DB_PATH ?? `${parsed.WBD_STORAGE_PATH}/db`,
  };

  return envConfig;
}
