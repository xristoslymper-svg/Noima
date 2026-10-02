import Link from "next/link";
import {ArrowLeft,ClipboardCheck,Mic2,ShieldCheck} from "lucide-react";
import {getDemoPatient} from "@/lib/patients/demo-patients";
import {notFound} from "next/navigation";
export const dynamic="force-dynamic";
export default async function DemoPatientPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params; const p=await getDemoPatient(id).catch(()=>null); if(!p)notFound();
 return <main className="clinical-page"><div className="clinical-top"><Link href="/patients" className="back"><ArrowLeft size={17}/> Ασθενείς</Link><span>Δοκιμαστικός κλινικός φάκελος</span></div>
 <div className="patient-hero"><div><p className="eyebrow">TEST PATIENT · PERSISTED</p><h1>{p.first_name} {p.last_name}</h1><p>{p.reported_age ? p.reported_age+" ετών · " : ""}Νέα καρτέλα</p></div></div>
 <section className="patient-layout"><div className="patient-main"><div className="card focus-card"><span className="kicker">ΝΕΟΣ ΦΑΚΕΛΟΣ</span><h2><ClipboardCheck size={19}/> Η καρτέλα δημιουργήθηκε πραγματικά</h2><p>{p.note||"Δεν έχει ακόμη καταγραφεί λόγος προσέλευσης."}</p><div className="risk-strip"><ShieldCheck size={17}/> Δεν υπάρχει ακόμη εγκεκριμένη κλινική σύνοψη. Θα δημιουργηθεί από τις εγκεκριμένες καταχωρήσεις συνεδρίας.</div></div>
 <div className="card"><h2><Mic2 size={18}/> Πρώτη συνεδρία</h2><p>Η καρτέλα έχει μόνιμο patient ID. Η πλήρης υπαγόρευση/approval ροή θα συνδεθεί σε αυτό το ID στο επόμενο βήμα.</p></div></div></section></main>
}