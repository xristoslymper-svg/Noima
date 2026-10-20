'use client';
import {isLocale,languageNames,locales,type Locale} from '@/i18n/config';
import {recipientLink} from '@/i18n/recipient';
import {loadMessages} from '@/i18n/messages';

import {useSystemMessage} from '@/i18n/system-message';

import {useTranslations} from 'next-intl';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Mail,X,ExternalLink} from 'lucide-react';
import type {MailboxStatus} from './MailboxSettings';
export type AssessmentLink={id:string;token:string;link:string};
export default function AssessmentEmail({email,instrument,prepare,onClose,onSent}:{email:string;instrument:string;prepare:()=>Promise<AssessmentLink>;onClose:()=>void;onSent:()=>void}){
 const systemMessage=useSystemMessage();

 const t=useTranslations();
 const [recipientLocale,setRecipientLocale]=useState<Locale>('el');
 const lastTemplate=useRef<{subject:string;body:string}|null>(null);
 const [templateReady,setTemplateReady]=useState(false);
 useEffect(()=>{let live=true;void loadMessages(recipientLocale).then(messages=>{if(!live)return;const previous=lastTemplate.current;const next={subject:messages.notifications.assessmentEmailSubject,body:messages.notifications.assessmentEmailBody};setSubject(current=>!previous||current===previous.subject?next.subject:current);setBody(current=>!previous||current===previous.body?next.body:current);lastTemplate.current=next;setTemplateReady(true)}).catch(()=>setError(t('errors.requestFailed')));return()=>{live=false}},[recipientLocale]);

 const dialog=useRef<HTMLDialogElement>(null),[to,setTo]=useState(email),[subject,setSubject]=useState(''),[body,setBody]=useState(''),[status,setStatus]=useState<MailboxStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();void fetch('/api/mailbox',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();setStatus(await r.json())}).catch(()=>setError(t('errors.mailboxLoadAlternative')))},[]);
 async function deliver(e:FormEvent,external=false){e.preventDefault();setBusy(true);setError('');try{const prepared=await prepare(),a={...prepared,link:recipientLink(prepared.link,recipientLocale)};const message=body.includes('[questionnaire_link]')?body.replaceAll('[questionnaire_link]',a.link):body+'\n\n'+a.link;
 if(external){window.location.href='mailto:'+encodeURIComponent(to)+'?'+new URLSearchParams({subject,body:message}).toString().replaceAll('+','%20');setBusy(false);return}
 const r=await fetch('/api/mailbox/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assessment_id:a.id,token:a.token,to,subject,body:message})});const d=await r.json();if(!r.ok)throw new Error(d.error);onSent();onClose();
 }catch(e){setError(e instanceof Error?e.message:t('errors.emailSendFailed'))}finally{setBusy(false)}}
 return <dialog ref={dialog} className="assessment-email-dialog" aria-label={t('psychometrics.sendQuestionnaire')} onCancel={e=>{if(busy)e.preventDefault();else onClose()}}><header><div><span className="kicker">{instrument}  {t('psychometrics.questionnaireKickerSuffix')}</span><h2><Mail size={20}/>  {t('notifications.sendEmail')}</h2></div><button type="button" className="mail-close" aria-label={t('common.close')} disabled={busy} onClick={onClose}><X size={20}/></button></header><form onSubmit={e=>void deliver(e,!status?.mailbox)}><fieldset disabled={busy||!templateReady}><label>{t('documents.recipientLanguage')}<select value={recipientLocale} onChange={e=>{if(isLocale(e.target.value)){setTemplateReady(false);setRecipientLocale(e.target.value)}}}>{locales.map(code=><option key={code} value={code}>{languageNames[code]}</option>)}</select></label><small>{t('documents.recipientLanguageHelp')}</small><small>{t('psychometrics.originalInstrumentLanguage')}</small><label>{t('notifications.from')}<div className="mail-sender">{status?.mailbox?.email||t('notifications.yourMailbox')}{!status?.mailbox&&<small>{t('notifications.mailboxSenderHelp')}</small>}</div></label><label>{t('notifications.to')}<input autoFocus={!email} type="email" required maxLength={254} autoComplete="email" value={to} onChange={e=>setTo(e.target.value)} placeholder={t('notifications.recipientEmail')}/></label><label>{t('notifications.subject')}<input required maxLength={200} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>{t('notifications.message')}<textarea required maxLength={9000} rows={7} value={body} onChange={e=>setBody(e.target.value)}/></label><small>{t('notifications.linkAddedAutomatically')}</small>{error&&<p role="alert" className="mail-error">{systemMessage(error)}</p>}<footer>{!status?.mailbox&&<a href="/account">{t('notifications.connectSender')}</a>}<button type={status?.mailbox?'button':'submit'} className={status?.mailbox?'mail-secondary':'mail-primary'} onClick={status?.mailbox?e=>{const form=e.currentTarget.form;if(form?.reportValidity())void deliver(e,true)}:undefined}>{!status?.mailbox?<ExternalLink size={16}/>:null}{status?.mailbox?t('notifications.openMailbox'):busy?t('common.preparing'):t('notifications.openMailbox')}</button>{status?.mailbox&&<button type="submit" className="mail-primary">{busy?t('common.sending'):t('common.send')}</button>}</footer></fieldset></form></dialog>
}
