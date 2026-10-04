import { withPilot } from '@/lib/pilot/route';
import { startDemoCalendarSession } from "@/lib/calendar/demo-supabase";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({})) as { tester?: unknown; event_id?: unknown };
  const tester = typeof body.tester === "string" ? body.tester : "";
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  if (!uuid.test(tester) || !uuid.test(eventId)) {
    return Response.json({ error: "Μη έγκυρο ραντεβού." }, { status: 400 });
  }
  try {
    const session = await startDemoCalendarSession(tester, eventId);
    return Response.json({ session });
  } catch {
    return Response.json({ error: "Δεν ήταν δυνατή η έναρξη της συνεδρίας." }, { status: 502 });
  }
}

export const POST = withPilot(handlePOST);
