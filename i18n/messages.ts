import type greek from './messages/el.json';
import type {Locale} from './config';
export type Messages = typeof greek;
export async function loadMessages(locale: Locale): Promise<Messages> {
  // Only the selected language is sent to the browser. Further languages are lazy chunks.
  return locale === 'en' ? (await import('./messages/en.json')).default : (await import('./messages/el.json')).default;
}
