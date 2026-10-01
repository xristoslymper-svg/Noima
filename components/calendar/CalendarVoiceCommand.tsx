'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic2, ShieldCheck, Sparkles, Square, X } from 'lucide-react';

type Stage = 'ready' | 'permission' | 'recording' | 'transcribing' | 'review' | 'error';

export default function CalendarVoiceCommand({ onClose }: { onClose: () => void }) {
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
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      fail('Το πρόγραμμα περιήγησης δεν υποστηρίζει ηχογράφηση. Δοκιμάστε ένα ενημερωμένο πρόγραμμα περιήγησης.');
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
      form.append('file', blob, `calendar-command.${extension}`);
      form.append('purpose', 'calendar');

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
        fail('Δεν αναγνωρίστηκε ομιλία. Δοκιμάστε ξανά.');
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
        setSeconds(Math.min(30, elapsed));
        if (elapsed >= 30) stop();
      }, 250);
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      fail(
        denied
          ? 'Δεν δόθηκε πρόσβαση στο μικρόφωνο. Επιτρέψτε την πρόσβαση από τις ρυθμίσεις του browser και δοκιμάστε ξανά.'
          : 'Δεν βρέθηκε διαθέσιμο μικρόφωνο. Ελέγξτε τη σύνδεσή του και δοκιμάστε ξανά.',
      );
    }
  }

  return (
    <div className="voice-command-overlay" onClick={onClose}>
      <section className="voice-command-card" onClick={event => event.stopPropagation()} aria-modal="true" role="dialog">
        <button className="voice-command-close" onClick={onClose} aria-label="Κλείσιμο φωνητικής εντολής">
          <X size={18} />
        </button>

        {stage === 'review' ? (
          <>
            <div className="voice-command-head">
              <div className="voice-orb small"><Sparkles size={20} /></div>
              <div>
                <span className="kicker">ΜΕΤΑΓΡΑΦΗ ΕΝΤΟΛΗΣ</span>
                <h3>Ελέγξτε τι ακούστηκε</h3>
              </div>
            </div>

            {editing ? (
              <textarea
                className="voice-command-textarea"
                autoFocus
                value={text}
                onChange={event => setText(event.target.value)}
                rows={4}
                aria-label="Κείμενο φωνητικής εντολής"
              />
            ) : (
              <div className="voice-transcript">“{text}”</div>
            )}

            <div className="voice-safe-note">
              <ShieldCheck size={15} />
              Η μεταγραφή είναι πραγματική. Η κατανόηση και εκτέλεση της εντολής δεν είναι ακόμη συνδεδεμένη με το ημερολόγιο.
            </div>

            <footer>
              <button onClick={() => setEditing(true)} disabled={editing}>Επεξεργασία</button>
              <button className="voice-confirm" disabled title="Θα ενεργοποιηθεί όταν συνδεθεί ο command parser με το calendar backend">
                <Sparkles size={15} /> Ανάλυση & εκτέλεση
              </button>
            </footer>
          </>
        ) : (
          <div className="voice-listening">
            <div className="voice-orb"><Mic2 size={24} /></div>
            <span className="kicker">ΦΩΝΗΤΙΚΗ ΕΝΤΟΛΗ</span>
            <h3>
              {stage === 'recording'
                ? 'Σας ακούω…'
                : stage === 'transcribing'
                  ? 'Μεταγράφω…'
                  : stage === 'permission'
                    ? 'Πρόσβαση στο μικρόφωνο…'
                    : stage === 'error'
                      ? 'Δεν ολοκληρώθηκε'
                      : 'Πείτε την εντολή σας'}
            </h3>

            <p>
              {stage === 'recording'
                ? `Ηχογράφηση · ${seconds} / 30″`
                : stage === 'transcribing'
                  ? 'Το GPT μετατρέπει την εντολή σας σε κείμενο.'
                  : stage === 'error'
                    ? error
                    : 'π.χ. «Μετέφερε τη Μαρία αύριο από τις 11 στις 12:30»'}
            </p>

            {stage === 'recording' && <div className="voice-wave"><i/><i/><i/><i/><i/></div>}

            <div className="voice-capture-actions">
              {stage === 'ready' && (
                <button className="voice-confirm" onClick={() => void start()}>
                  <Mic2 size={16} /> Έναρξη
                </button>
              )}
              {stage === 'recording' && (
                <button className="voice-confirm" onClick={stop}>
                  <Square size={15} /> Διακοπή & μεταγραφή
                </button>
              )}
              {stage === 'error' && (
                <button onClick={() => { setStage('ready'); setError(''); }}>
                  Δοκιμή ξανά
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
