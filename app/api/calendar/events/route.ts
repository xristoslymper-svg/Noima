import { fetchDemoCalendarEvents } from "@/lib/calendar/demo-supabase";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const tester = new URL(request.url).searchParams.get("tester") || "";
  if (!uuid.test(tester)) {
    return Response.json({ error: "Λείπει η δοκιμαστική ταυτότητα." }, { status: 400 });
  }
  try {
    const events = await fetchDemoCalendarEvents(tester);
    return Response.json({ events });
  } catch {
    return Response.json(
      { error: "Δεν ήταν δυνατή η φόρτωση του ημερολογίου." },
      { status: 502 },
    );
  }
}
