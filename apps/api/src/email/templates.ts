import type { EmailTemplateConfig } from "./config";

export type EmailKind =
  | "verification"
  | "welcome"
  | "passwordReset"
  | "passwordChanged";
export interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function renderAccountEmail(
  config: EmailTemplateConfig,
  to: string,
  kind: EmailKind,
  token?: string,
): EmailPayload {
  const content = {
    verification: [
      "Confirm your email",
      "Confirm your email address for Will Be Done. This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
      "Confirm email",
      "/verify-email",
    ],
    welcome: [
      "Welcome to Will Be Done",
      "Your email is confirmed. Welcome! Start with one task, put it in a project, and choose a day to work on it.",
      "Open Will Be Done",
      "/",
    ],
    passwordReset: [
      "Reset your password",
      "Someone requested a password reset for your Will Be Done account. This link expires in 1 hour. If this wasn't you, you can ignore this email; your password has not changed.",
      "Reset password",
      "/reset-password",
    ],
    passwordChanged: [
      "Your password was changed",
      "Your Will Be Done password was reset and all existing login and API tokens were revoked. If you didn't make this change, reset your password immediately using Forgot password on the sign-in page.",
      "Go to sign in",
      "/login",
    ],
  }[kind];
  const [subject, message, label, path] = content;
  const link = `${config.appUrl}${path}${token ? `#token=${encodeURIComponent(token)}` : ""}`;
  return {
    from: config.from,
    to,
    subject,
    text: `Will Be Done\n\n${subject}\n\n${message}\n\n${label}: ${link}`,
    html: `<html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><main style="max-width:520px;margin:32px auto;padding:32px;background:white;border-radius:12px"><p style="color:#2563eb;font-weight:bold">Will Be Done</p><h1 style="font-size:24px">${escapeHtml(subject)}</h1><p style="line-height:1.6">${escapeHtml(message)}</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#2563eb;color:white;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p><p style="font-size:12px;line-height:1.6">Or open this link:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p></main></body></html>`,
  };
}
