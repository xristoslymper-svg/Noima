'use client';
import {useAccountSession} from '@/components/AccountSessionBoundary';
import PresenceEditor from './PresenceEditor';
export default function PresenceConnected({hosted=false,googleMaps=false}:{hosted?:boolean;googleMaps?:boolean}){const account=useAccountSession();if(!account)return null;const key='noima:presence:synthetic:v1:'+account.user_id+':'+(account.identity?.workspace_id||'');return <PresenceEditor key={key} storageKey={key} hosted={hosted} googleMaps={googleMaps}/>}