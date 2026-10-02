'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Mic2, Send, ShieldCheck, Sparkles, Square, X } from 'lucide-react';

type Intent = 'move' | 'cancel' | 'create' | 'schedule_follow_up' | 'find_availability';
type MissingField = 'patient' | 'date' | 'time' | 'appointment' | 'recurrence';
type Stage = 'ready' | 'permission' | 'recording' | 'transcribing' | 'parsing' | 'proposal' | 'applying' | 'done' | 'error';

type Command = {
  action: Intent | 'clarify';
  intended_action: Intent | null;
  event_id: string | null;
  patient_name: string | null;
  start_iso: string | null;
  end_iso: string | null;
  target_date: string | null;
  duration_minutes: number | null;
  appointment_type: 'follow_up' | 'initial_assessment' | 'other' | null;
  clarification: string | null;
  missing_fields: MissingField[];
};

type Slot = { start_iso: string; end_iso: string; label: string };
type ClarificationOption = { label: string; value: string };

type Proposal = {
  transcript: string;
  follow_ups?: string[];
  command: Command;
  summary: string;
  available_slots: Slot[];
  clarification_options?: ClarificationOption[];
};

export default function CalendarVoiceCommand({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: (event?: { scheduled_start?: string }) => Promise<void> | void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const captureMode = useRef<'initial' | 'clarification'>('initial');

  const [stage, setStage] = useState<Stage>('ready');
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  function clearTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  function stopStream() {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }

  function fail(message: string) {
    clearTimer();
    stopStream();
    if (recorder.current) {
      recorder.current.onstop = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
      recorder.current = null;
    }
    busy.current = false;
    if (alive.current) {
      setError(message);
      setStage('error');
    }
  }

  useEffect(() => {
    alive.current = true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      fail('Το πρόγραμμα περιήγησης δεν υποστηρίζει ηχογράφηση.');
    }
    return () => {
      alive.current = false;
      clearTimer();
      if (recorder.current) {
        recorder.current.onstop = null;
        recorder.current.ondataavailable = null;
        if (recorder.current.state !== 'inactive') recorder.current.stop();
      }
      stopStream();
    };
  }, []);

  async function parseCommand(text: string, answers: string[] = followUps) {
    if (!text.trim()) return;
    setStage('parsing');
    setError('');

    try {
      const response = await fetch('/api/calendar/command/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text.trim(), follow_ups: answers }),
      });
      const data = (await response.json().catch(() => ({}))) as Proposal & { error?: string };

      if (!response.ok || !data.command) {
        fail(data.error || 'Δεν μπόρεσα να καταλάβω την εντολή.');
        return;
      }

      if (!alive.current) return;
      setProposal(data);
      setTranscript(data.transcript || text.trim());
      setFollowUps(data.follow_ups || answers);
      setClarificationAnswer('');
      busy.current = false;
      setStage('proposal');
    } catch {
      fail('Δεν ήταν δυνατή η ανάλυση της εντολής. Δοκιμάστε ξανά.');
    }
  }

  async function submitClarification(rawAnswer: string) {
    const answer = rawAnswer.trim();
    if (!answer || !transcript.trim()) return;
    const next = [...followUps, answer].slice(-6);
    setFollowUps(next);
    setClarificationAnswer('');
    await parseCommand(transcript, next);
  }

  async function transcribe(blob: Blob, mode: 'initial' | 'clarification') {
    if (!alive.current) return;
    if (blob.size < 800) {
      fail('Η ηχογράφηση είναι πολύ σύντομη ή δεν ακούγεται ομιλία.');
      return;
    }

    setStage('transcribing');
    try {
      const form = new FormData();
      const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
      form.append('file', blob, `calendar-command.${extension}`);
      form.append('purpose', 'calendar');

      const response = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string; code?: string };

      if (!response.ok) {
        fail(data.code === 'missing_api_key'
          ? 'Η υπηρεσία GPT μεταγραφής δεν είναι ρυθμισμένη στο production περιβάλλον.'
          : data.error || 'Η μεταγραφή δεν ολοκληρώθηκε.');
        return;
      }

      const text = data.text?.trim();
      if (!text) {
        fail('Δεν αναγνωρίστηκε ομιλία. Δοκιμάστε ξανά.');
        return;
      }

      if (mode === 'clarification') {
        setClarificationAnswer(text);
        await submitClarification(text);
      } else {
        setTranscript(text);
        setFollowUps([]);
        await parseCommand(text, []);
      }
    } catch {
      fail('Δεν ήταν δυνατή η επικοινωνία με την υπηρεσία μεταγραφής.');
    }
  }

  function stop() {
    clearTimer();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopStream();
  }

  async function start(mode: 'initial' | 'clarification' = 'initial') {
    if (busy.current) return;
    busy.current = true;
    captureMode.current = mode;
    setError('');
    if (mode === 'initial') {
      setProposal(null);
      setFollowUps([]);
      setTranscript('');
    }
    setStage('permission');

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (!alive.current) {
        media.getTracks().forEach(track => track.stop());
        return;
      }

      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];

      recording.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recording.onerror = () => fail('Η ηχογράφηση διακόπηκε. Ελέγξτε το μικρόφωνο.');
      recording.onstop = () => {
        clearTimer();
        stopStream();
        recorder.current = null;
        const blob = new Blob(chunks, { type: recording.mimeType });
        chunks.length = 0;
        void transcribe(blob, captureMode.current);
      };

      recording.start(250);
      setSeconds(0);
      setStage('recording');
      const began = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(Math.min(30, elapsed));
        if (elapsed >= 30) stop();
      }, 250);
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      fail(denied
        ? 'Δεν δόθηκε πρόσβαση στο μικρόφωνο. Επιτρέψτε την πρόσβαση και δοκιμάστε ξανά.'
        : 'Δεν βρέθηκε διαθέσιμο μικρόφωνο.');
    }
  }

  function useSlot(slot: Slot) {
    if (!proposal?.command.patient_name) return;
    const appointmentType = proposal.command.appointment_type || 'follow_up';
    setProposal({
      ...proposal,
      summary: `Νέο ραντεβού: ${proposal.command.patient_name} · ${slot.label}`,
      available_slots: [],
      command: {
        ...proposal.command,
        action: 'create',
        intended_action: 'create',
        start_iso: slot.start_iso,
        end_iso: slot.end_iso,
        duration_minutes: proposal.command.duration_minutes ?? 50,
        appointment_type: appointmentType,
        clarification: null,
        missing_fields: [],
      },
    });
  }

  async function confirm() {
    if (!proposal || proposal.command.action === 'clarify' || proposal.command.action === 'find_availability') return;

    setStage('applying');
    setError('');
    try {
      const command = proposal.command;
      const response = await fetch('/api/calendar/command/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: command.action,
          event_id: command.event_id,
          patient_name: command.patient_name,
          start_iso: command.start_iso,
          end_iso: command.end_iso,
          appointment_type: command.appointment_type,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        event?: { scheduled_start?: string };
      };

      if (!response.ok) {
        if (data.code === 'calendar_conflict') {
          setProposal({
            ...proposal,
            summary: 'Η ώρα δεν είναι διαθέσιμη',
            command: {
              ...proposal.command,
              action: 'clarify',
              intended_action: proposal.command.action as Intent,
              clarification: 'Υπάρχει ήδη άλλο ραντεβού σε αυτή την ώρα. Πείτε μια άλλη ώρα για να συνεχίσουμε.',
              missing_fields: ['time'],
            },
            clarification_options: [],
          });
          busy.current = false;
          setStage('proposal');
          return;
        }
        fail(data.error || 'Η αλλαγή δεν αποθηκεύτηκε.');
        return;
      }

      await onApplied(data.event);
      setDoneMessage(proposal.summary);
      setStage('done');
    } catch {
      fail('Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά.');
    }
  }

  function reset() {
    busy.current = false;
    setStage('ready');
    setTranscript('');
    setFollowUps([]);
    setClarificationAnswer('');
    setProposal(null);
    setError('');
    setDoneMessage('');
  }

  const isClarify = proposal?.command.action === 'clarify';
  const isAvailability = proposal?.command.action === 'find_availability';
  const clarificationCancelled =
    Boolean(isClarify) &&
    proposal?.command.missing_fields.length === 0 &&
    Boolean(proposal.command.clarification?.toLocaleLowerCase('el').includes('ακυρώ'));
  const canAnswerClarification = Boolean(isClarify && !clarificationCancelled);

  return (
    <div className="voice-command-overlay" onClick={onClose}>
      <section className="voice-command-card" onClick={event => event.stopPropagation()} aria-modal="true" role="dialog">
        <button className="voice-command-close" onClick={onClose} aria-label="Κλείσιμο φωνητικής εντολής">
          <X size={18} />
        </button>

        {stage === 'proposal' && proposal ? (
          <>
            <div className="voice-command-head">
              <div className="voice-orb small"><Sparkles size={20} /></div>
              <div>
                <span className="kicker">
                  {isClarify ? 'ΧΡΕΙΑΖΕΤΑΙ ΜΙΑ ΔΙΕΥΚΡΙΝΙΣΗ' : isAvailability ? 'ΔΙΑΘΕΣΙΜΟΤΗΤΑ' : 'ΠΡΙΝ ΓΙΝΕΙ Η ΑΛΛΑΓΗ'}
                </span>
                <h3>{isClarify ? proposal.command.clarification : proposal.summary}</h3>
              </div>
            </div>

            <label className="voice-command-edit-label">
              Τι άκουσα
              <textarea
                className="voice-command-textarea"
                value={transcript}
                onChange={event => setTranscript(event.target.value)}
                rows={3}
              />
            </label>

            {followUps.length > 0 && (
              <div className="voice-followup-history">
                {followUps.map((answer, index) => <span key={`${answer}-${index}`}>{answer}</span>)}
              </div>
            )}

            {canAnswerClarification && (
              <div className="voice-clarification-answer">
                {(proposal.clarification_options || []).length > 0 && (
                  <div className="voice-clarification-options">
                    {(proposal.clarification_options || []).map(option => (
                      <button key={option.label} onClick={() => void submitClarification(option.value)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                <label>
                  Απαντήστε για να συνεχίσω
                  <div className="voice-answer-row">
                    <input
                      value={clarificationAnswer}
                      onChange={event => setClarificationAnswer(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && clarificationAnswer.trim()) {
                          event.preventDefault();
                          void submitClarification(clarificationAnswer);
                        }
                      }}
                      placeholder={proposal.command.missing_fields.includes('patient') ? 'π.χ. Μαρία' : 'Γράψτε τη διευκρίνιση…'}
                      autoFocus
                    />
                    <button className="voice-answer-mic" onClick={() => void start('clarification')} aria-label="Απάντηση με φωνή" title="Απάντηση με φωνή">
                      <Mic2 size={17} />
                    </button>
                    <button className="voice-answer-send" onClick={() => void submitClarification(clarificationAnswer)} disabled={!clarificationAnswer.trim()} aria-label="Συνέχεια">
                      <Send size={16} />
                    </button>
                  </div>
                </label>
                <small>Δεν χρειάζεται να ξαναπείτε όλη την εντολή. Θα κρατήσω όσα έχετε ήδη δώσει.</small>
              </div>
            )}

            {isAvailability && (
              <div className="voice-slot-list">
                {proposal.available_slots.length ? proposal.available_slots.map(slot => (
                  <div key={slot.start_iso} className="voice-slot">
                    <ClockIcon />
                    <span>{slot.label}</span>
                    {proposal.command.patient_name && (
                      <button onClick={() => useSlot(slot)}>Κλείσιμο εδώ</button>
                    )}
                  </div>
                )) : <span>Δεν βρέθηκε διαθέσιμη ώρα στο ωράριο 09:00–18:00.</span>}
              </div>
            )}

            <div className="voice-safe-note">
              <ShieldCheck size={15} />
              {isClarify
                ? 'Δεν έγινε καμία αλλαγή.'
                : isAvailability
                  ? 'Η αναζήτηση διαθεσιμότητας δεν αλλάζει το ημερολόγιο.'
                  : 'Καμία αλλαγή δεν γίνεται πριν πατήσετε Επιβεβαίωση.'}
            </div>

            <footer>
              <button onClick={clarificationCancelled ? reset : () => void parseCommand(transcript, [])}>
                {clarificationCancelled ? 'Νέα εντολή' : 'Ανάλυση από την αρχή'}
              </button>
              {!isClarify && !isAvailability && (
                <button className="voice-confirm" onClick={() => void confirm()}>
                  <Check size={15} /> Επιβεβαίωση
                </button>
              )}
            </footer>
          </>
        ) : stage === 'done' ? (
          <div className="voice-listening voice-done">
            <div className="voice-done-icon"><Check size={22} /></div>
            <span className="kicker">ΑΠΟΘΗΚΕΥΤΗΚΕ</span>
            <h3>Το ημερολόγιο ενημερώθηκε</h3>
            <p>{doneMessage}</p>
            <div className="voice-done-actions">
              <button onClick={reset}>Νέα εντολή</button>
              <button className="voice-confirm" onClick={onClose}>Τέλος</button>
            </div>
          </div>
        ) : (
          <div className="voice-listening">
            <div className="voice-orb"><Mic2 size={24} /></div>
            <span className="kicker">{captureMode.current === 'clarification' ? 'ΑΠΑΝΤΗΣΗ' : 'ΦΩΝΗΤΙΚΗ ΕΝΤΟΛΗ'}</span>
            <h3>
              {stage === 'recording'
                ? captureMode.current === 'clarification' ? 'Σας ακούω — απαντήστε μόνο στη διευκρίνιση' : 'Σας ακούω…'
                : stage === 'transcribing'
                  ? 'Μεταγράφω…'
                  : stage === 'parsing'
                    ? 'Ελέγχω την εντολή…'
                    : stage === 'applying'
                      ? 'Ενημερώνω το ημερολόγιο…'
                      : stage === 'permission'
                        ? 'Πρόσβαση στο μικρόφωνο…'
                        : stage === 'error'
                          ? 'Δεν ολοκληρώθηκε'
                          : 'Τι θέλετε να κάνω στο ημερολόγιο;'}
            </h3>

            <p>
              {stage === 'recording'
                ? `Ηχογράφηση · ${seconds} / 30″`
                : stage === 'transcribing'
                  ? 'Μετατρέπω την ομιλία σας σε κείμενο.'
                  : stage === 'parsing'
                    ? 'Ελέγχω ασθενή, ραντεβού, ημερομηνία, ώρα και τυχόν σύγκρουση.'
                    : stage === 'applying'
                      ? 'Αποθηκεύω μόνο την αλλαγή που επιβεβαιώσατε.'
                      : stage === 'error'
                        ? error
                        : 'Μπορείτε να δημιουργήσετε, μεταφέρετε ή ακυρώσετε ραντεβού και να ζητήσετε διαθέσιμες ώρες.'}
            </p>

            {stage === 'ready' && (
              <div className="voice-examples">
                <span>«Κλείσε τη Μαρία αύριο στις 12»</span>
                <span>«Μετέφερε τον Γιάννη στις 13:00»</span>
                <span>«Βρες μου κενό την Παρασκευή»</span>
              </div>
            )}

            {stage === 'recording' && <div className="voice-wave"><i/><i/><i/><i/><i/></div>}

            <div className="voice-capture-actions">
              {stage === 'ready' && (
                <button className="voice-confirm" onClick={() => void start('initial')}>
                  <Mic2 size={16} /> Έναρξη
                </button>
              )}
              {stage === 'recording' && (
                <button className="voice-confirm" onClick={stop}>
                  <Square size={15} /> Διακοπή & μεταγραφή
                </button>
              )}
              {stage === 'error' && (
                <>
                  <button onClick={reset}>Νέα εντολή</button>
                  <button className="voice-confirm" onClick={() => void start(captureMode.current)}>
                    <Mic2 size={16} /> Δοκιμή ξανά
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ClockIcon() {
  return <span aria-hidden="true" className="voice-slot-dot" />;
}
