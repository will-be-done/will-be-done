export async function verifyCaptchaToken(
  token: string,
  secretKey: string,
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
    },
  );

  const data = (await response.json()) as {
    success: boolean;
    "error-codes": string[];
  };

  return data.success;
}
