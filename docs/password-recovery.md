# Cross-browser password recovery

Hosted Supabase project: mgpnaxaquzeoomxdzhic. Change only the Reset password email body to match `supabase/templates/recovery.html` **after** deploying the application change. Keep the existing subject, SMTP configuration, Google provider and signup email template unchanged.

The template uses the configured canonical Site URL, https://noima-pi.vercel.app, rather than a temporary Vercel deployment host. New recovery links contain the one-time TokenHash in a URL fragment. The fragment is not sent in the initial HTTP request or referrer. GET /reset-password renders the existing form without consuming the token.

On explicit form submission, POST /api/auth/password checks same-origin and password length, verifies only a recovery token through an isolated in-memory Supabase client, then changes that verified account's password. It never reuses an ambient signed-in account for the update. Expired/used/wrong-type tokens fail closed. Successful changes revoke recovery/old refresh sessions and return to sign-in. No service-role key is used.

Old PKCE links retain the existing recovery-session path and its verified recovery-claim requirement. They still require the original browser; request a fresh email for the new behavior.

Tests use synthetic tokens and isolated mocks. A live email may be sent to the user-authorized test address, but the account owner must enter and submit their password directly.
