import { fetchDemoCalendarEvents } from "@/lib/calendar/demo-supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await fetchDemoCalendarEvents();
    return Response.json({ events });
  } catch {
    return Response.json(
      { error: "Δεν ήταν δυνατή η φόρτωση του ημερολογίου." },
      { status: 502 },
    );
  }
}
