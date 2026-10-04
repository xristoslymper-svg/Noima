'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
export default function PilotProfile(){
 const [name,setName]=useState('Ο χώρος μου');
 useEffect(()=>{void fetch('/api/pilot').then(r=>r.json()).then(d=>{if(d.identity?.full_name)setName(d.identity.full_name)}).catch(()=>{})},[]);
 return <Link className="profile" href="/account" aria-label="Λογαριασμός και αναφορά προβλήματος"><div className="avatar">{name.split(' ').slice(0,2).map(s=>s[0]).join('')}</div><div><strong>{name}</strong><span>Ιδιωτικός πιλοτικός χώρος</span></div></Link>;
}
