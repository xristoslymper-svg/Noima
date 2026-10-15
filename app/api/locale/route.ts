import {cookies} from 'next/headers';
import {pilotClient} from '@/lib/pilot/server';
import {isLocale, localeCookie} from '@/i18n/config';
export const dynamic = 'force-dynamic';
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store'}});
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({code: 'invalid_origin'}, 403);
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).some(key => key !== 'locale') || !isLocale(body.locale)) return reply({code: 'invalid_locale'}, 400);
  const client = await pilotClient();
  const {data: {user}, error} = await client.auth.getUser();
  // A temporary auth failure must not downgrade an authenticated preference to an anonymous cookie.
  if (error && error.name !== 'AuthSessionMissingError') return reply({code: 'locale_unavailable'}, 503);
  if (user) {
    // updateUser can update only the authenticated user; no caller-supplied identity or service key.
    const {error: updateError} = await client.auth.updateUser({data: {noima_locale: body.locale}});
    if (updateError) return reply({code: 'locale_save_failed'}, 503);
  }
  (await cookies()).set(localeCookie, body.locale, {path: '/', sameSite: 'lax', secure: new URL(request.url).protocol === 'https:', httpOnly: true, maxAge: 31536000});
  return reply({locale: body.locale});
}
