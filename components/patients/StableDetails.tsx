'use client';
import {useState,type ReactNode} from 'react';
// Persist disclosure intent across autosaves; a keyed visit creates fresh intent.
export default function StableDetails({initialOpen=false,className,children,'data-mobile-section':mobileSection,tabIndex}:{initialOpen?:boolean;className?:string;children:ReactNode;'data-mobile-section'?:string;tabIndex?:number}){
 const [open,setOpen]=useState(initialOpen);
 return <details className={className} data-mobile-section={mobileSection} tabIndex={tabIndex} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>{children}</details>;
}
