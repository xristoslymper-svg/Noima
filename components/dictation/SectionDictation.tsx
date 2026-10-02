'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic2, Square, X } from 'lucide-react';

type Stage = 'ready' | 'permission' | 'recording' | 'transcribing' | 'review' | 'error';
type Props = { title: string; onClose: () => void; onInsert: (text: string) => void };

export default function SectionDictation({ title, onClose, onInsert }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const [stage, setStage] = useState<Stage>('ready');
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

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
    dialog.current?.showModal();

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      fail('Το πρόγραμμα περιήγησης δεν υποστηρίζει ηχογράφηση. Δοκιμάστε ένα ενημερωμένο πρόγραμμα περιήγησης ή γράψτε το κείμενο παρακάτω.');
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

  async function transcribe(blob: Blob) {
    if (!alive.current) return;
    if (blob.size < 800) {
      fail('Η ηχογράφηση είναι πολύ σύντομη ή δεν ακούγεται ομιλία. Δοκιμάστε ξανά.');
      return;
    }

    setStage('transcribing');

    try {
      const form = new FormData();
      const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
      form.append('file', blob, `dictation.${extension}`);

      const response = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string; code?: string };

      if (!response.ok) {
        if (data.code === 'missing_api_key') {
          fail('Η υπηρεσία GPT μεταγραφής δεν είναι ρυθμισμένη στο production περιβάλλον.');
        } else {
          fail(data.error || 'Η μεταγραφή δεν ολοκληρώθηκε. Δοκιμάστε ξανά.');
        }
        return;
      }

      const transcript = data.text?.trim();
      if (!transcript) {
        fail('Δεν αναγνωρίστηκε ομιλία. Δοκιμάστε ξανά ή γράψτε το κείμενο.');
        return;
      }

      busy.current = false;
      setText(transcript);
      setStage('review');
    } catch {
      fail('Δεν ήταν δυνατή η επικοινωνία με την υπηρεσία μεταγραφής. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.');
    }
  }

  function stop() {
    clearTimer();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopStream();
  }

  async function start() {
    if (busy.current) return;
    busy.current = true;
    setError('');
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
      recording.onerror = () => fail('Η ηχογράφηση διακόπηκε. Ελέγξτε το μικρόφωνο και δοκιμάστε ξανά.');
      recording.onstop = () => {
        clearTimer();
        stopStream();
        recorder.current = null;
        const blob = new Blob(chunks, { type: recording.mimeType });
        chunks.length = 0;
        void transcribe(blob);
      };

      recording.start(250);
      setSeconds(0);
      setStage('recording');
      const began = Date.now();

      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(Math.min(60, elapsed));
        if (elapsed >= 60) stop();
      }, 250);
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      fail(
        denied
          ? 'Δεν δόθηκε πρόσβαση στο μικρόφωνο. Επιτρέψτε την πρόσβαση από τις ρυθμίσεις του browser και δοκιμάστε ξανά.'
          : 'Δεν βρέθηκε διαθέσιμο μικρόφωνο. Ελέγξτε τη σύνδεσή του ή γράψτε το κείμενο.',
      );
    }
  }

  return (
    <dialog
      ref={dialog}
      className="dictation-dialog"
      aria-labelledby="dictation-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <span className="kicker">ΥΠΑΓΟΡΕΥΣΗ · ΕΛΛΗΝΙΚΑ</span>
          <h2 id="dictation-title">{title}</h2>
        </div>
        <button className="dictation-close" onClick={onClose} aria-label="Κλείσιμο υπαγόρευσης">
          <X size={20} />
        </button>
      </header>

      <p>Σύντομη υπαγόρευση έως 60″ με GPT speech-to-text και έλεγχο πριν από την προσθήκη.</p>
      <p className="dictation-help">
        Η ηχογράφηση αποστέλλεται με ασφάλεια στην υπηρεσία μεταγραφής και επιστρέφει μόνο κείμενο. Ελέγξτε το αποτέλεσμα πριν το καταχωρήσετε.
      </p>

      <div className="dictation-status" role="status" aria-live="polite">
        {stage === 'ready' && 'Έτοιμο. Πατήστε Έναρξη και μιλήστε καθαρά.'}
        {stage === 'permission' && 'Επιτρέψτε τη χρήση του μικροφώνου…'}
        {stage === 'recording' && `Ηχογράφηση · ${seconds} / 60″`}
        {stage === 'transcribing' && 'Μετατροπή ομιλίας σε κείμενο με GPT…'}
        {stage === 'review' && 'Ελέγξτε και διορθώστε τη μεταγραφή πριν την προσθήκη.'}
      </div>

      {stage === 'error' && <p className="dictation-error" role="alert">{error}</p>}

      {stage === 'ready' && (
        <button className="dictation-primary" onClick={() => void start()}>
          <Mic2 size={18} /> Έναρξη ηχογράφησης
        </button>
      )}

      {stage === 'recording' && (
        <button className="dictation-primary" onClick={stop}>
          <Square size={16} /> Διακοπή & μεταγραφή
        </button>
      )}

      {(stage === 'review' || stage === 'error') && (
        <div className="dictation-review">
          {editing || stage === 'error' ? (
            <label>
              Κείμενο προς έλεγχο
              <textarea
                autoFocus
                rows={7}
                value={text}
                onChange={event => setText(event.target.value)}
                placeholder="Γράψτε ή διορθώστε το κείμενο της ενότητας…"
              />
            </label>
          ) : (
            <p className="dictation-transcript">{text}</p>
          )}
          <small>Ελέγξτε ιδιαίτερα αρνήσεις, ονόματα φαρμάκων και δόσεις. Μετά το ΟΚ δημιουργείται δομημένη κλινική πρόταση για δικό σας έλεγχο και έγκριση.</small>
        </div>
      )}

      <footer>
        <span>Η μεταγραφή θα αποθηκευτεί ως πρόταση · δεν γίνεται επίσημη καταχώρηση χωρίς έγκριση.</span>
        <div>
          {stage === 'review' ? (
            <>
              <button onClick={() => setEditing(true)} disabled={editing}>Επεξεργασία</button>
              <button className="dictation-primary" disabled={!text.trim()} onClick={() => onInsert(text.trim())}>ΟΚ</button>
            </>
          ) : (
            <>
              <button onClick={onClose}>Ακύρωση</button>
              {stage === 'error' && (
                <button className="dictation-primary" disabled={!text.trim()} onClick={() => onInsert(text.trim())}>ΟΚ</button>
              )}
            </>
          )}
        </div>
      </footer>
    </dialog>
  );
}
