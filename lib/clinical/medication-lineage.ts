import type {PatientBundle,DemoMedicationEvent} from '../patients/demo-runtime';
/** Follow explicit revision edges only. Dates never establish visit ownership. */
export function medicationEventSession(bundle:PatientBundle,event:DemoMedicationEvent){
 const visit=(id:string)=>bundle.sessions.find(s=>s.id===id&&s.patient_id===bundle.patient.id)?.id;
 if(event.patient_id!==bundle.patient.id)return undefined;
 if(event.session_id)return visit(event.session_id);
 const seen=new Set<string>(),origins=new Set<string>();
 function walk(id:string){if(seen.has(id))return;seen.add(id);
  for(const revision of bundle.medicationRevisions.filter(r=>r.replacement_id===id)){
   const parent=bundle.medicationEvents.find(p=>p.id===revision.event_id&&p.patient_id===bundle.patient.id&&p.medication_id===event.medication_id);
   if(!parent)continue;
   if(parent.session_id){const source=visit(parent.session_id);if(source)origins.add(source)}else walk(parent.id);
  }
 }
 walk(event.id);return origins.size===1?[...origins][0]:undefined;
}
