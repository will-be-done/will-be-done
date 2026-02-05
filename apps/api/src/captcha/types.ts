import { z } from "zod";

export const CaptchaConfigSchema = z.object({
  CF_CAPTCHA_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  CF_CAPTCHA_SITE_KEY: z.string().optional(),
  CF_CAPTCHA_SECRET_KEY: z.string().optional(),
});

export type CaptchaConfig = z.infer<typeof CaptchaConfigSchema>;

export function getCaptchaConfig(): CaptchaConfig | null {
  const rawConfig = {
    CF_CAPTCHA_ENABLED: process.env.CF_CAPTCHA_ENABLED,
    CF_CAPTCHA_SITE_KEY: process.env.CF_CAPTCHA_SITE_KEY,
    CF_CAPTCHA_SECRET_KEY: process.env.CF_CAPTCHA_SECRET_KEY,
  };

  const config = CaptchaConfigSchema.parse(rawConfig);

  if (!config.CF_CAPTCHA_ENABLED) {
    return null;
  }

  if (!config.CF_CAPTCHA_SITE_KEY) {
    throw new Error("CF_CAPTCHA_SITE_KEY is required when captcha is enabled");
  }
  if (!config.CF_CAPTCHA_SECRET_KEY) {
    throw new Error(
      "CF_CAPTCHA_SECRET_KEY is required when captcha is enabled"
    );
  }

  return config;
}

export async function verifyCaptchaToken(
  token: string,
  secretKey: string
): Promise<boolean> {
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: token,
      }),
    }
  );

  const data = (await response.json()) as {
    success: boolean;
    "error-codes": string[];
  };

  return data.success;
}
