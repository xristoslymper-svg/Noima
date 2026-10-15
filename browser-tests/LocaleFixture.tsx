import type {ReactNode} from 'react';
import LocaleProvider from '../i18n/LocaleProvider';
import messages from '../i18n/messages/el.json';
/** Exercise the same production provider in isolated component fixtures. */
export default function LocaleFixture({children}: {children: ReactNode}) {
  return <LocaleProvider initialLocale="el" initialMessages={messages}>{children}</LocaleProvider>;
}
