import type { EmailTemplateConfig } from "./config";

export type EmailKind =
  | "verification"
  | "welcome"
  | "passwordReset"
  | "emailChange"
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
  newEmail?: string,
): EmailPayload {
  const content = {
    verification: [
      "Confirm your email",
      "Confirm your email address for Will Be Done. This link expires in 24 hours. If you didn't create an account, you can ignore this email.",
      "Confirm email",
      "/verify-email",
    ],
    emailChange: [
      "Confirm your email change",
      `Confirm changing your Will Be Done email address to ${newEmail}. This link expires in 1 hour. If you didn't request this change, ignore this email; your email address has not changed.`,
      "Confirm email change",
      "/change-email",
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
  const textStyle =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Fira Sans','Droid Sans','Helvetica Neue',sans-serif;font-size:14px;line-height:24px;color:#222222";
  const paragraphStyle = `${textStyle};margin:0;padding:7px 0`;
  return {
    from: config.from,
    to,
    subject,
    text: `Hey,\n\n${message}\n\n${label}: ${link}\n\nCheers,\nWill Be Done`,
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#ffffff;${textStyle}">
    <table role="presentation" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:600px">
      <tr>
        <td>
          <p style="${paragraphStyle}">Hey,</p>
          <p style="${paragraphStyle}">${escapeHtml(message)}</p>
          <p style="${paragraphStyle}"><a href="${escapeHtml(link)}" style="color:#0670db;text-decoration:underline">${escapeHtml(label)} →</a></p>
          <p style="${paragraphStyle}">Cheers,<br>Will Be Done</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}
