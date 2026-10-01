'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic2, Square, X } from 'lucide-react';

type Stage = 'loading' | 'ready' | 'permission' | 'recording' | 'transcribing' | 'review' | 'error';
type Props = { title: string; onClose: () => void; onInsert: (text: string) => void };

export default function SectionDictation({ title, onClose, onInsert }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const [stage, setStage] = useState<Stage>('loading');
  const [progress, setProgress] = useState('Προετοιμασία αναγνώρισης ομιλίας…');
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  function clearTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }
  function clearDeadline() {
    if (deadline.current) clearTimeout(deadline.current);
    deadline.current = null;
  }
  function stopStream() {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }
  function fail(message: string) {
    clearTimer(); clearDeadline(); stopStream();
    if (recorder.current) {
      recorder.current.onstop = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
      recorder.current = null;
    }
    busy.current = false;
    if (alive.current) { setError(message); setStage('error'); }
  }

  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      fail('Το πρόγραμμα περιήγησης δεν υποστηρίζει ηχογράφηση. Δοκιμάστε ένα ενημερωμένο πρόγραμμα περιήγησης ή γράψτε το κείμενο παρακάτω.');
      return () => { alive.current = false; };
    }
    const instance = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = ({ data }) => {
      if (!alive.current) return;
      if (data.type === 'progress') setProgress(`Φόρτωση μοντέλου ομιλίας · ${data.progress}% του τρέχοντος αρχείου`);
      if (data.type === 'ready') { clearDeadline(); setStage('ready'); }
      if (data.type === 'result') {
        clearDeadline(); busy.current = false;
        if (!data.text) { fail('Δεν αναγνωρίστηκε ομιλία. Κλείστε και δοκιμάστε ξανά ή γράψτε το κείμενο.'); return; }
        setText(data.text); setStage('review');
      }
      if (data.type === 'error') fail('Η αναγνώριση δεν ολοκληρώθηκε. Ελέγξτε τη σύνδεση και τη διαθέσιμη μνήμη ή γράψτε το κείμενο.');
    };
    instance.onerror = () => fail('Δεν ήταν δυνατή η εκκίνηση της αναγνώρισης. Μπορείτε να γράψετε το κείμενο.');
    deadline.current = setTimeout(() => {
      instance.terminate(); fail('Η φόρτωση άργησε πολύ. Κλείστε και δοκιμάστε ξανά με σταθερή σύνδεση.');
    }, 300_000);
    instance.postMessage({ type: 'load' });
    return () => {
      alive.current = false;
      clearTimer(); clearDeadline();
      if (recorder.current) {
        recorder.current.onstop = null;
        recorder.current.ondataavailable = null;
        if (recorder.current.state !== 'inactive') recorder.current.stop();
      }
      stopStream(); instance.terminate(); worker.current = null;
    };
  }, []);

  async function transcribe(blob: Blob) {
    if (!alive.current) return;
    setStage('transcribing');
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const length = Math.min(decoded.length, Math.floor(decoded.sampleRate * 60));
      const offline = new OfflineAudioContext(1, Math.ceil(length * 16000 / decoded.sampleRate), 16000);
      const source = offline.createBufferSource();
      source.buffer = decoded; source.connect(offline.destination); source.start();
      const audio = (await offline.startRendering()).getChannelData(0);
      if (!alive.current) return;
      const rms = Math.sqrt(audio.reduce((sum, sample) => sum + sample * sample, 0) / audio.length);
      if (audio.length < 8000 || rms < 0.001) {
        fail('Η ηχογράφηση είναι πολύ σύντομη ή δεν ακούγεται ομιλία. Κλείστε και δοκιμάστε ξανά.'); return;
      }
      deadline.current = setTimeout(() => {
        worker.current?.terminate(); fail('Η μεταγραφή άργησε πολύ σε αυτή τη συσκευή. Δοκιμάστε μικρότερη υπαγόρευση.');
      }, 180_000);
      worker.current?.postMessage({ type: 'transcribe', audio }, [audio.buffer]);
    } catch {
      fail('Δεν ήταν δυνατή η ανάγνωση της ηχογράφησης. Δοκιμάστε ξανά ή γράψτε το κείμενο.');
    } finally { await context?.close(); }
  }

  function stop() {
    clearTimer();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopStream();
  }

  async function start() {
    if (busy.current) return;
    busy.current = true; setStage('permission');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!alive.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const recording = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onerror = () => fail('Η ηχογράφηση διακόπηκε. Ελέγξτε το μικρόφωνο και δοκιμάστε ξανά.');
      recording.onstop = () => {
        clearTimer(); stopStream(); recorder.current = null;
        const blob = new Blob(chunks, { type: recording.mimeType });
        chunks.length = 0;
        void transcribe(blob);
      };
      recording.start(250); setSeconds(0); setStage('recording');
      const began = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(Math.min(60, elapsed));
        if (elapsed >= 60) stop();
      }, 250);
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      fail(denied ? 'Δεν δόθηκε πρόσβαση στο μικρόφωνο. Επιτρέψτε την πρόσβαση από τις ρυθμίσεις του προγράμματος περιήγησης και δοκιμάστε ξανά.' : 'Δεν βρέθηκε διαθέσιμο μικρόφωνο. Ελέγξτε τη σύνδεσή του ή γράψτε το κείμενο.');
    }
  }

  return <dialog ref={dialog} className="dictation-dialog" aria-labelledby="dictation-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><span className="kicker">ΥΠΑΓΟΡΕΥΣΗ · ΕΛΛΗΝΙΚΑ</span><h2 id="dictation-title">{title}</h2></div><button className="dictation-close" onClick={onClose} aria-label="Κλείσιμο υπαγόρευσης"><X size={20}/></button></header>
    <p>Σύντομη υπαγόρευση έως 60″. Ο ήχος επεξεργάζεται στη συσκευή σας και δεν αποστέλλεται σε διακομιστή.</p>
    <p className="dictation-help">Στην πρώτη χρήση φορτώνεται αυτόματα ένα μοντέλο ομιλίας. Δεν χρειάζεται εγκατάσταση. Δοκιμάστε με υποθετικά περιστατικά.</p>
    <div className="dictation-status" role="status" aria-live="polite">
      {stage === 'loading' && progress}
      {stage === 'ready' && 'Έτοιμο. Πατήστε Έναρξη και μιλήστε καθαρά.'}
      {stage === 'permission' && 'Επιτρέψτε τη χρήση του μικροφώνου…'}
      {stage === 'recording' && `Ηχογράφηση · ${seconds} / 60″`}
      {stage === 'transcribing' && 'Μετατροπή ομιλίας σε κείμενο… Η ταχύτητα εξαρτάται από τη συσκευή σας.'}
      {stage === 'review' && 'Ελέγξτε και διορθώστε τη μεταγραφή πριν την προσθήκη.'}
    </div>
    {stage === 'error' && <p className="dictation-error" role="alert">{error}</p>}
    {stage === 'ready' && <button className="dictation-primary" onClick={() => void start()}><Mic2 size={18}/> Έναρξη ηχογράφησης</button>}
    {stage === 'recording' && <button className="dictation-primary" onClick={stop}><Square size={16}/> Διακοπή & μεταγραφή</button>}
    {(stage === 'review' || stage === 'error') && <div className="dictation-review">{editing || stage === 'error' ? <label>Κείμενο προς έλεγχο<textarea autoFocus rows={7} value={text} onChange={event => setText(event.target.value)} placeholder="Γράψτε ή διορθώστε το κείμενο της ενότητας…"/></label> : <p className="dictation-transcript">{text}</p>}<small>Ελέγξτε ιδιαίτερα αρνήσεις, ονόματα φαρμάκων και δόσεις. Δεν γίνεται αυτόματη κλινική ερμηνεία.</small></div>}
    <footer><span>Προσωρινό προσχέδιο · δεν αποθηκεύεται στον φάκελο.</span><div>{stage === 'review' ? <><button onClick={() => setEditing(true)} disabled={editing}>Επεξεργασία</button><button className="dictation-primary" disabled={!text.trim()} onClick={() => onInsert(text.trim())}>ΟΚ</button></> : <><button onClick={onClose}>Ακύρωση</button>{stage === 'error' && <button className="dictation-primary" disabled={!text.trim()} onClick={() => onInsert(text.trim())}>ΟΚ</button>}</>}</div></footer>
  </dialog>;
}
