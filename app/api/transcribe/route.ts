import { withPilot } from '@/lib/pilot/route';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

async function handlePOST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Η υπηρεσία μεταγραφής δεν είναι ρυθμισμένη.", code: "missing_api_key" },
      { status: 503 },
    );
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return Response.json({ error: "Μη έγκυρη ηχογράφηση." }, { status: 400 });
  }

  const file = incoming.get("file");
  const purpose = incoming.get("purpose") === "calendar" ? "calendar" : "clinical";
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Δεν βρέθηκε αρχείο ήχου." }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Η ηχογράφηση είναι πολύ μεγάλη." }, { status: 413 });
  }

  const body = new FormData();
  body.append("file", file, file.name || "dictation.webm");
  body.append("model", "gpt-transcribe");
  body.append(
    "prompt",
    purpose === "calendar"
      ? "Greek calendar voice command. Transcribe faithfully and literally. Preserve patient names, dates, relative dates such as today/tomorrow/next Tuesday, times, durations, recurrence wording, and Greek/English mixed terms. Do not execute, summarize, infer, or rewrite the command."
      : "Greek psychiatric clinical dictation. Transcribe faithfully in the original language. Preserve negations, medication names, doses, units, scores, punctuation, and mixed Greek/English medical terminology. Do not summarize, interpret, or add clinical information.",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL||"https://api.openai.com/v1"}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return Response.json(
        { error: "Η μεταγραφή δεν ολοκληρώθηκε. Δοκιμάστε ξανά.", code: "transcription_failed" },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) {
      return Response.json(
        { error: "Δεν αναγνωρίστηκε ομιλία.", code: "empty_transcript" },
        { status: 422 },
      );
    }

    return Response.json({ text });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return Response.json(
      {
        error: timedOut
          ? "Η μεταγραφή άργησε πολύ. Δοκιμάστε ξανά."
          : "Η υπηρεσία μεταγραφής δεν είναι προσωρινά διαθέσιμη.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const POST = withPilot(handlePOST);
