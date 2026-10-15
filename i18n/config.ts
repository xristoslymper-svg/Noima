export const locales = ['el', 'en'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'el';
export const localeCookie = 'noima-locale';
export const clinicalTimeZone = 'Europe/Athens';
export const localeNames: Record<Locale, string> = {el: 'Ελληνικά', en: 'English'};
export const languageNames = localeNames;
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.includes(value as Locale);
}
export function resolveLocale(preference: unknown, cookie: unknown): Locale {
  return isLocale(preference) ? preference : isLocale(cookie) ? cookie : defaultLocale;
}
export const intlLocale = (locale: string) => locale === 'en' ? 'en-GB' : 'el-GR';
