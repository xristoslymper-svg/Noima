import {getRequestConfig} from 'next-intl/server';
import {cookies, headers} from 'next/headers';
import {resolveLocale, localeCookie, clinicalTimeZone} from './config';
import {loadMessages} from './messages';
export default getRequestConfig(async () => {
  const [requestHeaders, store] = await Promise.all([headers(), cookies()]);
  // Middleware overwrites this internal header using the verified user's metadata.
  const locale = resolveLocale(requestHeaders.get('x-noima-locale'), store.get(localeCookie)?.value);
  return {locale, messages: await loadMessages(locale), timeZone: clinicalTimeZone};
});
