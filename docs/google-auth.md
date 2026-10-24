# Enable Google sign-in

Configure one Google OAuth web client for each deployment. The same client supports
browser and desktop sign-in. Desktop opens Google in the system browser and
receives the result on a temporary `127.0.0.1` port that only it listens on.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) in
   your Google Cloud project. Configure the app branding, audience, and consent
   screen. While the app is in testing, add your test users.
2. Create an OAuth client with application type **Web application**. Add your
   deployment's callback under **Authorized redirect URIs**:

   ```text
   https://app.example.com/api/auth/google/callback
   ```

   For local development with Vite, register the frontend origin's callback:

   ```text
   http://localhost:5173/api/auth/google/callback
   ```

   Use the exact hostname and port you open in the browser. Vite forwards the
   callback to the API. You do not need a separate desktop OAuth client or access
   to Google APIs beyond the `openid` and `email` scopes.

3. Set these variables on the API process:

   ```sh
   WBD_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   WBD_GOOGLE_CLIENT_SECRET=your-client-secret
   WBD_GOOGLE_PUBLIC_APP_URL=https://app.example.com
   ```

   Use your secret manager for the client secret. Do not put the secret in a
   `VITE_` variable. `WBD_GOOGLE_PUBLIC_APP_URL` must be an origin without a path,
   query, or fragment. HTTPS is required except on localhost.

   For the hosted app, set `WBD_GOOGLE_PUBLIC_APP_URL` to either
   `https://app.will-be-done.app` or `https://app2.will-be-done.app`. Sign-in
   automatically uses the domain where it starts. Register both callback URLs
   in the Google OAuth client:

   ```text
   https://app.will-be-done.app/api/auth/google/callback
   https://app2.will-be-done.app/api/auth/google/callback
   ```

   Self-hosted deployments accept only their configured origin. Requests without
   an `Origin` header use `WBD_GOOGLE_PUBLIC_APP_URL`.

   To disable Google sign-in, leave all three variables unset. Partial
   configuration prevents API startup. For self-hosted desktop use, configure
   these variables on the server selected in the desktop app.

4. Configure account email delivery if users need to establish a password or
   confirm a third-party email address. Set `WBD_EMAIL_RESEND_API_KEY`,
   `WBD_EMAIL_FROM`, and `WBD_EMAIL_PUBLIC_APP_URL` together. Use the same public
   app URL for email links so recovery opens this deployment.

   Google sign-in works without email delivery. A Google-created account cannot
   disconnect Google until its app email is confirmed and it has a password.

5. Restart the API. Startup backfills the normalized email index without changing
   existing user IDs, email spellings, passwords, or account data.
6. Open **Sign up** and select **Continue with Google**. Use a Google account that
   has no matching app account. Confirm that the app opens the spaces screen.
7. Open **Account settings**. To establish a password, select **Email me a
   password setup link** and follow the email link. Password setup signs out your
   existing sessions. Sign in again with your email and new password.
8. To connect an existing account, sign in with its password. Open **Account
   settings**, select **Connect Google**, choose the Google account, then confirm
   its email and your current app password. A different Google email is allowed;
   the app account email stays the same.
9. To disconnect Google, confirm the app email, enter the current app password,
   and select **Disconnect Google**. Existing app sessions remain active.
10. Test the desktop app against the same server. Select **Continue with Google**.
    The system browser opens Google directly. After Google responds, the browser
    returns to the desktop app's local listener and the app finishes signing in;
    the remaining tab can be closed. The app only accepts the one-time code sent
    to that listener, so a sign-in link started on another machine cannot finish
    there. Browser sign-in closes its Google tab and resumes in the original app
    tab. Cancellation and errors also return to the app. If automatic return is
    blocked, select **Return to Will Be Done** in the browser. Sign-in flows expire
    after ten minutes. If a flow expires or the browser closes, start again.

If Google sign-in reports an existing email, sign in with the account's existing
method and connect Google from Account settings. Use email password recovery if
you have forgotten the password. Google email matches never link accounts
automatically.

If Google reports a redirect URI mismatch, compare its registered URI with
the domain where sign-in started plus `/api/auth/google/callback`. Check the hostname,
port, protocol, and trailing path exactly.
