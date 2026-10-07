'use client';
import Link from 'next/link';
import {useAccountSession} from '@/components/AccountSessionBoundary';
export default function PilotProfile(){
 const account=useAccountSession();
 const name=account?.identity?.full_name||'Ο χώρος μου';
 return <Link className="profile" href="/account" aria-label={`Λογαριασμός ${account?.email||''}`}><div className="avatar">{name.split(/\s+/).slice(0,2).map(s=>s[0]).join('')}</div><div><strong>{name}</strong><span>{account?.email||'Ιδιωτικός πιλοτικός χώρος'}</span></div></Link>;
}
