// Enable only after custom SMTP and real confirmation/recovery delivery are verified.
// Existing password sign-in and authenticated password changes do not send email.
export const authEmailEnabled = process.env.NOIMA_AUTH_EMAIL_ENABLED === 'true';
