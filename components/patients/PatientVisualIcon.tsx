import {Activity,BookOpen,CalendarDays,ClipboardList,FileText,History,NotebookPen,Pill,ShieldCheck,Stethoscope} from 'lucide-react';
import styles from './PatientVisual.module.css';
// Decorative only: every existing heading and accessible action name stays unchanged.
const icons={summary:FileText,timeline:History,history:BookOpen,plan:ClipboardList,medication:Pill,risk:ShieldCheck,mse:Stethoscope,assessment:ClipboardList,measures:Activity,scores:Activity,psychometrics:Activity,appointment:CalendarDays,notes:NotebookPen,interview:NotebookPen};
export default function PatientVisualIcon({name}:{name?:string}){
 const Icon=icons[name as keyof typeof icons]||NotebookPen;
 return <span className={styles.icon} aria-hidden="true"><Icon size={18} strokeWidth={1.7} focusable="false"/></span>;
}
