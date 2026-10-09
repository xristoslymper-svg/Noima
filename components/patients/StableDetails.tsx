'use client';
import {useState,type ReactNode} from 'react';
// Persist disclosure intent across autosaves; a keyed visit creates fresh intent.
export default function StableDetails({initialOpen=false,className,children}:{initialOpen?:boolean;className?:string;children:ReactNode}){
 const [open,setOpen]=useState(initialOpen);
 return <details className={className} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>{children}</details>;
}
