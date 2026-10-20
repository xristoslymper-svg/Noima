import {errorJson} from '@/i18n/errors';
import { withPilot } from '@/lib/pilot/route';
import { startDemoCalendarSession } from "@/lib/calendar/demo-supabase";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handlePOST(request: Request) {
  const body = await request.json().catch(() => ({})) as { tester?: unknown; event_id?: unknown };
  const tester = typeof body.tester === "string" ? body.tester : "";
  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  if (!uuid.test(tester) || !uuid.test(eventId)) {
    return errorJson({ error: "Μη έγκυρο ραντεβού." }, { status: 400 });
  }
  try {
    const session = await startDemoCalendarSession(tester, eventId);
    return Response.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("draft_linked_elsewhere")) {
      return errorJson(
        { error: "Υπάρχει ήδη άλλη ανοιχτή επίσκεψη για αυτόν τον ασθενή. Συνεχίστε ή κλείστε πρώτα εκείνη.", code: "draft_linked_elsewhere" },
        { status: 409 },
      );
    }
    if (message.includes("open_draft_conflict")) {
      return errorJson(
        { error: "Υπάρχει ήδη ανοιχτή επίσκεψη διαφορετικού τύπου για αυτόν τον ασθενή. Συνεχίστε ή κλείστε πρώτα εκείνη.", code: "open_draft_conflict" },
        { status: 409 },
      );
    }
    if (message.includes("appointment_unavailable")) {
      return errorJson({ error: "Το ραντεβού δεν είναι πλέον διαθέσιμο για έναρξη.", code: "appointment_unavailable" }, { status: 409 });
    }
    return errorJson({ error: "Δεν ήταν δυνατή η έναρξη της συνεδρίας." }, { status: 502 });
  }
}

export const POST = withPilot(handlePOST);
