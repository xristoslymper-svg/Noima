'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic2, Square, X } from 'lucide-react';
import {appendDictationText,MAX_DICTATION_TEXT} from '@/lib/clinical/dictation-text';

type Stage = 'ready' | 'permission' | 'recording' | 'transcribing' | 'review' | 'error';
type Props = { title: string; storageKey:string; onClose: () => void; onInsert: (text: string) => void };

export default function SectionDictation({ title, storageKey, onClose, onInsert }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const [stage, setStage] = useState<Stage>('ready');
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState('');
  const [accepted,setAccepted]=useState('');
  const acceptedValue=useRef(accepted);acceptedValue.current=accepted;
  const [recovered,setRecovered]=useState(false),[recoveryReady,setRecoveryReady]=useState(false);
  const retryAudio=useRef<Blob|null>(null),request=useRef<AbortController|null>(null);
  const recoveryKey='noima-dictation:'+storageKey;
  useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(recoveryKey)||'null');if(saved&&typeof saved.accepted==='string'&&typeof saved.text==='string'&&saved.accepted.length+saved.text.length<=MAX_DICTATION_TEXT){setAccepted(saved.accepted);setText(saved.text);setRecovered(Boolean(saved.accepted||saved.text));if(saved.text)setStage('review')}}catch{}setRecoveryReady(true)},[recoveryKey]);
  useEffect(()=>{if(recoveryReady)try{if(accepted||text)sessionStorage.setItem(recoveryKey,JSON.stringify({accepted,text}));else sessionStorage.removeItem(recoveryKey)}catch{}},[accepted,text,recoveryReady,recoveryKey]);
  function insert(){try{const combined=appendDictationText(accepted,text);if(!combined)return;onInsert(combined);try{sessionStorage.removeItem(recoveryKey)}catch{}}catch(e){setError(e instanceof Error?e.message:'Δεν προστέθηκε το κείμενο.');setStage('error')}}
  function continueRecording(){try{const combined=appendDictationText(accepted,text);acceptedValue.current=combined;setAccepted(combined);setText('');retryAudio.current=null;void start()}catch(e){setError(e instanceof Error?e.message:'Δεν μπορεί να προστεθεί τμήμα.');setStage('error')}}
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
      request.current?.abort();
      retryAudio.current=null;
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

    retryAudio.current=blob;
    busy.current=true;
    request.current=new AbortController();
    setStage('transcribing');

    try {
      const form = new FormData();
      const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
      form.append('file', blob, `dictation.${extension}`);

      const response = await fetch('/api/transcribe', { method: 'POST', body: form,signal:request.current.signal });
      const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string; code?: string };

      if(!alive.current)return;
      if (!response.ok) {
        if (data.code === 'missing_api_key') {
          fail('Η υπηρεσία μεταγραφής δεν είναι διαθέσιμη. Το κείμενό σας διατηρείται.');
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
      try{appendDictationText(acceptedValue.current,transcript)}catch(e){setError(e instanceof Error?e.message:'Το κείμενο είναι πολύ μεγάλο.')}
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

      <p>Υπαγορεύστε σύντομα τμήματα έως 60″. Μπορείτε να προσθέσετε όσα χρειάζονται στο ίδιο πρόχειρο.</p>
      <p className="dictation-help">Ο ήχος χρησιμοποιείται για μεταγραφή και δεν αποθηκεύεται στον φάκελο. Ελέγξτε ιδιαίτερα αρνήσεις, φάρμακα και δόσεις.</p>
      {recovered&&<p role="status">Ανακτήθηκε κείμενο προηγούμενης υπαγόρευσης για αυτή την ενότητα.</p>}
      {accepted&&<label>Προηγούμενα ελεγμένα τμήματα<textarea rows={3} value={accepted} maxLength={MAX_DICTATION_TEXT} disabled={stage==='recording'||stage==='transcribing'||stage==='permission'} onChange={e=>setAccepted(e.target.value)}/></label>}
      <div className="dictation-status" role="status" aria-live="polite">
        {stage==='ready'&&'Έτοιμο για σύντομη υπαγόρευση.'}
        {stage==='permission'&&'Επιτρέψτε τη χρήση του μικροφώνου…'}
        {stage==='recording'&&`Ηχογράφηση · ${seconds} / 60″`}
        {stage==='transcribing'&&'Μετατροπή ομιλίας σε κείμενο…'}
        {stage==='review'&&'Διορθώστε αν χρειάζεται. Προσθέστε άλλο τμήμα ή χρησιμοποιήστε το κείμενο.'}
      </div>
      {error&&<p className="dictation-error" role="alert">{error}</p>}
      {stage==='ready'&&<button className="dictation-primary" onClick={()=>void start()}><Mic2 size={18}/> Έναρξη ηχογράφησης</button>}
      {stage==='recording'&&<button className="dictation-primary" onClick={stop}><Square size={16}/> Διακοπή & μεταγραφή</button>}
      {(stage==='review'||stage==='error')&&<label>Κείμενο προς έλεγχο<textarea autoFocus rows={5} value={text} onChange={e=>setText(e.target.value)} placeholder="Διορθώστε ή γράψτε το κείμενο αυτού του τμήματος…"/></label>}
      <footer><span>Επεξεργάσιμο πρόχειρο · η κλινική έγκριση ακολουθεί στην καταγραφή.</span><div>
        {(stage==='review'||stage==='error')&&<>
          <button onClick={continueRecording}>Προσθήκη επόμενου τμήματος</button>
          {stage==='error'&&retryAudio.current&&<button onClick={()=>void transcribe(retryAudio.current!)}>Επανάληψη μεταγραφής</button>}
        </>}
        {!['recording','transcribing','permission'].includes(stage)&&<button className="dictation-primary" disabled={!text.trim()&&!accepted.trim()} onClick={insert}>Χρήση κειμένου</button>}
        <button onClick={onClose}>Κλείσιμο — διατήρηση κειμένου</button>
      </div></footer>
    </dialog>
  );
}
