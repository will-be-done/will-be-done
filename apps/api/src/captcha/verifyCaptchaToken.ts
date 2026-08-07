export async function verifyCaptchaToken(
  token: string,
  secretKey: string,
  signal?: AbortSignal,
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
      signal,
    },
  );

  const data = (await response.json()) as {
    success: boolean;
    "error-codes": string[];
  };

  return data.success;
}

export async function verifyCaptchaTokenWithTimeout(
  token: string,
  secretKey: string,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await verifyCaptchaToken(token, secretKey, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return false;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
