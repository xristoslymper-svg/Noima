import GoogleCalendarPreview from '@/components/calendar/GoogleCalendarPreview';
import Link from 'next/link';
export default function Page(){return <main className="pilot-page"><section className="pilot-card pilot-account"><Link href="/calendar">← Επιστροφή στο ημερολόγιο</Link><h1>Σύνδεση Google Calendar</h1><GoogleCalendarPreview/></section></main>}
