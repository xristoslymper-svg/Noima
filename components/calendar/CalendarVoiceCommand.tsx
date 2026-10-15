'use client';
import {useLocale,useTranslations} from 'next-intl';


import { useEffect, useRef, useState } from 'react';
import { Check, Mic2, Send, ShieldCheck, Sparkles, Square, X } from 'lucide-react';
import {useCalendarDialog} from '@/components/calendar/useCalendarDialog';
import { getDemoTesterId } from '@/lib/demo-tester';

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
  patient_id?: string | null;
  new_patient?: boolean;
  expected_updated_at?: string | null;
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
 const t=useTranslations();
 const locale=useLocale();

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const captureMode = useRef<'initial' | 'clarification'>('initial');

  const [stage, setStage] = useState<Stage>('ready');
  const dialogRef=useCalendarDialog(onClose,stage==='applying'||stage==='transcribing'||stage==='parsing');
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const [donePatientId, setDonePatientId] = useState<string | null>(null);

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
      fail(t('errors.recordingUnsupported'));
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
        headers: { 'Content-Type': 'application/json','x-noima-output-locale':locale },
        body: JSON.stringify({ transcript: text.trim(), follow_ups: answers, tester: getDemoTesterId() }),
      });
      const data = (await response.json().catch(() => ({}))) as Proposal & { error?: string };

      if (!response.ok || !data.command) {
        fail(data.error || t('calendar.voiceNotUnderstood'));
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
      fail(t('errors.voiceCommandParse'));
    }
  }

  const displayFollowUp=(value:string)=>{
    if (/event_id\s+[0-9a-f-]{36}/i.test(value)) return t('calendar.specificAppointmentSelected');
    return value
      .replace(/\s*\[patient_id:[0-9a-f-]{36}\]/i,"")
      .replace(/\s*\[create_new_patient:true\]/i,"");
  };

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
      fail(t('errors.recordingTooShort'));
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
          ? t('errors.transcriptionNotConfigured')
          : data.error || t('errors.transcriptionIncomplete'));
        return;
      }

      const text = data.text?.trim();
      if (!text) {
        fail(t('errors.noSpeech'));
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
      fail(t('errors.transcriptionConnection'));
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
      recording.onerror = () => fail(t('errors.recordingInterrupted'));
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
        ? t('errors.microphonePermission')
        : t('errors.noMicrophone'));
    }
  }

  function selectSlot(slot: Slot) {
    if (!proposal?.command.patient_name) return;
    const appointmentType = proposal.command.appointment_type || 'follow_up';
    setProposal({
      ...proposal,
      summary: `${proposal.command.new_patient ? t('calendar.newPatientAndAppointment') : t('calendar.newAppointment')}: ${proposal.command.patient_name} · ${slot.label}`,
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

  const creationRequest=useRef<{signature:string;id:string}|null>(null);
  async function confirm() {
    if (!proposal || proposal.command.action === 'clarify' || proposal.command.action === 'find_availability') return;

    setStage('applying');
    setError('');
    try {
      const command = proposal.command;
      const signature=JSON.stringify(command);
      if(!creationRequest.current||creationRequest.current.signature!==signature)creationRequest.current={signature,id:crypto.randomUUID()};
      const response = await fetch('/api/calendar/command/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tester: getDemoTesterId(),
          action: command.action,
          event_id: command.event_id,
          expected_updated_at: command.expected_updated_at,
          patient_name: command.patient_name,
          start_iso: command.start_iso,
          end_iso: command.end_iso,
          appointment_type: command.appointment_type,
          patient_id: command.patient_id || null,
          create_new_patient: Boolean(command.new_patient),
          request_id:creationRequest.current.id,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        event?: { scheduled_start?: string };
        patient_id?: string | null;
      };

      if (!response.ok) {
        if (data.code === 'calendar_conflict' || data.code === 'past_appointment') {
          const past = data.code === 'past_appointment';
          setProposal({
            ...proposal,
            summary: past ? t('calendar.timePast') : t('calendar.timeUnavailable'),
            command: {
              ...proposal.command,
              action: 'clarify',
              intended_action: proposal.command.action as Intent,
              clarification: past
                ? t('calendar.voiceTimePastHelp')
                : t('calendar.voiceConflictHelp'),
              missing_fields: past ? ['date','time'] : ['time'],
            },
            clarification_options: [],
          });
          busy.current = false;
          setStage('proposal');
          return;
        }
        if (data.code === 'session_already_started') {
          fail(t('calendar.voiceVisitStartedHelp'));
          return;
        }
        fail(data.error || t('errors.changeSave'));
        return;
      }

      await onApplied(data.event);
      setDoneMessage(proposal.summary);
      setDonePatientId(data.patient_id || proposal.command.patient_id || null);
      setStage('done');
    } catch {
      fail(t('errors.changeSaveRetry'));
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
    setDonePatientId(null);
  }

  const isClarify = proposal?.command.action === 'clarify';
  const isAvailability = proposal?.command.action === 'find_availability';
  const clarificationCancelled =
    Boolean(isClarify) &&
    proposal?.command.missing_fields.length === 0 &&
    Boolean(proposal.command.clarification?.toLocaleLowerCase('el').includes('ακυρώ')||/cancelled|canceled/i.test(proposal.command.clarification||''));
  const canAnswerClarification = Boolean(isClarify && !clarificationCancelled);

  return (
    <div className="voice-command-overlay" onClick={() => {if(stage !== 'applying')onClose()}}>
      <section className="voice-command-card" onClick={event => event.stopPropagation()} aria-modal="true" ref={dialogRef} tabIndex={-1} role="dialog">
        <button className="voice-command-close" onClick={onClose} disabled={stage === 'applying'} aria-label={t('accessibility.closeVoiceCommand')}>
          <X size={18} />
        </button>

        {stage === 'proposal' && proposal ? (
          <>
            <div className="voice-command-head">
              <div className="voice-orb small"><Sparkles size={20} /></div>
              <div>
                <span className="kicker">
                  {isClarify ? t('calendar.clarificationKicker') : isAvailability ? t('calendar.availabilityKicker') : t('calendar.beforeChangeKicker')}
                </span>
                <h3>{isClarify ? proposal.command.clarification : proposal.summary}</h3>
              </div>
            </div>

            <details className="voice-command-transcript">
              <summary>{t('calendar.heardText')}</summary>
              <label className="voice-command-edit-label">
                <textarea
                  className="voice-command-textarea"
                  value={transcript}
                  onChange={event => setTranscript(event.target.value)}
                  rows={3}
                />
              </label>
              <small>{t('calendar.transcriptCorrectionHelp')}</small>
            </details>

            {followUps.length > 0 && (
              <div className="voice-followup-history">
                {followUps.map((answer, index) => <span key={`${answer}-${index}`}>{displayFollowUp(answer)}</span>)}
              </div>
            )}

            {proposal.command.new_patient && proposal.command.patient_name && !isAvailability && !isClarify && (
              <div className="voice-new-patient-note">
                <strong>{t('patients.newPatient')}</strong>
                <span>{t('calendar.noRecordForPrefix')} {proposal.command.patient_name}{t('calendar.voiceCreateRecordHelp')}</span>
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
                   {t('calendar.answerToContinue')} <div className="voice-answer-row">
                    <input
                      value={clarificationAnswer}
                      onChange={event => setClarificationAnswer(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && clarificationAnswer.trim()) {
                          event.preventDefault();
                          void submitClarification(clarificationAnswer);
                        }
                      }}
                      placeholder={proposal.command.missing_fields.includes('patient') ? t('patients.nameExample') : t('calendar.clarificationPlaceholder')}
                      autoFocus
                    />
                    <button className="voice-answer-mic" onClick={() => void start('clarification')} aria-label={t('calendar.answerByVoice')} title={t('calendar.answerByVoice')}>
                      <Mic2 size={17} />
                    </button>
                    <button className="voice-answer-send" onClick={() => void submitClarification(clarificationAnswer)} disabled={!clarificationAnswer.trim()} aria-label={t('common.continue')}>
                      <Send size={16} />
                    </button>
                  </div>
                </label>
                <small>{t('calendar.keepCommandContext')}</small>
              </div>
            )}

            {isAvailability && (
              <div className="voice-slot-list">
                {proposal.available_slots.length ? proposal.available_slots.map(slot => (
                  <div key={slot.start_iso} className="voice-slot">
                    <ClockIcon />
                    <span>{slot.label}</span>
                    {proposal.command.patient_name && (
                      <button onClick={() => selectSlot(slot)}>{t('common.closeHere')}</button>
                    )}
                  </div>
                )) : <span>{t('calendar.noAvailability')}</span>}
              </div>
            )}

            <div className="voice-safe-note">
              <ShieldCheck size={15} />
              {isClarify
                ? t('common.noChangesMade')
                : isAvailability
                  ? t('calendar.availabilityReadOnly')
                  : t('calendar.confirmBeforeChange')}
            </div>

            <footer>
              <button onClick={clarificationCancelled ? reset : () => void parseCommand(transcript, [])}>
                {clarificationCancelled ? t('calendar.newCommand') : t('calendar.startAgain')}
              </button>
              {!isClarify && !isAvailability && (
                <button className="voice-confirm" onClick={() => void confirm()}>
                  <Check size={15} /> {proposal.command.new_patient ? t('calendar.createPatientAppointment') : t('common.confirm')}
                </button>
              )}
            </footer>
          </>
        ) : stage === 'done' ? (
          <div className="voice-listening voice-done">
            <div className="voice-done-icon"><Check size={22} /></div>
            <span className="kicker">{t('common.savedKicker')}</span>
            <h3>{t('calendar.updated')}</h3>
            <p>{doneMessage}</p>
            <div className="voice-done-actions">
              <button onClick={reset}>{t('calendar.newCommand')}</button>
              {donePatientId&&<button onClick={()=>{window.location.href='/patients/demo/'+encodeURIComponent(donePatientId)}}>{t('patients.openRecord')}</button>}
              <button className="voice-confirm" onClick={onClose}>{t('common.finish')}</button>
            </div>
          </div>
        ) : (
          <div className="voice-listening">
            <div className="voice-orb"><Mic2 size={24} /></div>
            <span className="kicker">{captureMode.current === 'clarification' ? t('calendar.answerKicker') : t('calendar.voiceCommandKicker')}</span>
            <h3>
              {stage === 'recording'
                ? captureMode.current === 'clarification' ? t('calendar.listeningClarification') : t('calendar.listening')
                : stage === 'transcribing'
                  ? t('calendar.transcribing')
                  : stage === 'parsing'
                    ? t('calendar.checkingCommand')
                    : stage === 'applying'
                      ? t('calendar.updating')
                      : stage === 'permission'
                        ? t('calendar.requestingMicrophone')
                        : stage === 'error'
                          ? t('common.incomplete')
                          : t('calendar.voicePrompt')}
            </h3>

            <p>
              {stage === 'recording'
                ? t('calendar.recordingProgress',{seconds})
                : stage === 'transcribing'
                  ? t('calendar.transcribingHelp')
                  : stage === 'parsing'
                    ? t('calendar.checkingHelp')
                    : stage === 'applying'
                      ? t('calendar.savingConfirmedHelp')
                      : stage === 'error'
                        ? error
                        : t('calendar.voiceCapabilities')}
            </p>

            {stage === 'ready' && (
              <div className="voice-examples">
                <span>{t('calendar.voiceExampleBook')}</span>
                <span>{t('calendar.voiceExampleNewPatient')}</span>
                <span>{t('calendar.voiceExampleMove')}</span>
                <span>{t('calendar.voiceExampleAvailability')}</span>
              </div>
            )}

            {stage === 'recording' && <div className="voice-wave"><i/><i/><i/><i/><i/></div>}
            {stage === 'ready' && <label>{t('calendar.typeCommandAlternative')}<textarea aria-label={t('accessibility.calendarWrittenCommand')} className="voice-command-textarea" maxLength={1000} value={transcript} onChange={event=>setTranscript(event.target.value)}/></label>}

            <div className="voice-capture-actions">
              {stage === 'ready' && <button disabled={!transcript.trim()} onClick={()=>void parseCommand(transcript,[])}>{t('calendar.analyseCommand')}</button>}
              {stage === 'ready' && (
                <button className="voice-confirm" onClick={() => void start('initial')}>
                  <Mic2 size={16} />  {t('common.getStarted')} </button>
              )}
              {stage === 'recording' && (
                <button className="voice-confirm" onClick={stop}>
                  <Square size={15} />  {t('calendar.stopAndTranscribe')} </button>
              )}
              {stage === 'error' && (
                <>
                  <button onClick={reset}>{t('calendar.newCommand')}</button>
                  <button className="voice-confirm" onClick={() => void start(captureMode.current)}>
                    <Mic2 size={16} />  {t('common.retry')} </button>
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
