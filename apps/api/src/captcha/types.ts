import { z } from "zod";

export const CaptchaConfigSchema = z.object({
  WBD_CF_CAPTCHA_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  WBD_CF_CAPTCHA_SITE_KEY: z.string().optional(),
  WBD_CF_CAPTCHA_SECRET_KEY: z.string().optional(),
});

export type CaptchaConfig = z.infer<typeof CaptchaConfigSchema>;

export function getCaptchaConfig(): CaptchaConfig | null {
  const rawConfig = {
    WBD_CF_CAPTCHA_ENABLED: process.env.WBD_CF_CAPTCHA_ENABLED,
    WBD_CF_CAPTCHA_SITE_KEY: process.env.WBD_CF_CAPTCHA_SITE_KEY,
    WBD_CF_CAPTCHA_SECRET_KEY: process.env.WBD_CF_CAPTCHA_SECRET_KEY,
  };

  const config = CaptchaConfigSchema.parse(rawConfig);

  if (!config.WBD_CF_CAPTCHA_ENABLED) {
    return null;
  }

  if (!config.WBD_CF_CAPTCHA_SITE_KEY) {
    throw new Error(
      "WBD_CF_CAPTCHA_SITE_KEY is required when captcha is enabled",
    );
  }
  if (!config.WBD_CF_CAPTCHA_SECRET_KEY) {
    throw new Error(
      "WBD_CF_CAPTCHA_SECRET_KEY is required when captcha is enabled",
    );
  }

  return config;
}
