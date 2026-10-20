import type {PatientRegistryRow} from './registry-layout';
const names=[['Μαρία','Δείγμα'],['Μαρία','Δείγμα'],['Αλέξανδρος','Παράδειγμα'],['Ελένη','Δοκιμαστική'],['Νικόλαος','Συνθετικός'],['Άννα','Δείγμα'],['Κωνσταντίνος Αλέξανδρος','Παράδειγμα με μεγάλο επώνυμο'],['Σοφία','Δοκιμή']];
export const registrySimulation:PatientRegistryRow[]=names.map(([first_name,last_name],index)=>({
 id:'10000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),first_name,last_name,reported_age:index===5?null:32+index*3,registry_number:index+1,
 phone:index===5?'':'69000000'+String(index+1).padStart(2,'0'),landline:'21000000'+String(index+1).padStart(2,'0'),contact_phone:'',email:'synthetic'+(index+1)+'@example.invalid',address:'Συνθετική διεύθυνση '+(index+1),
 note:'Συνθετική σημείωση φακέλου',chief_complaint:'Συνθετικό παράδειγμα λόγου προσέλευσης',status:index===4?'inactive':'active',created_at:'2026-09-'+String(index+1).padStart(2,'0')+'T09:00:00Z',updated_at:'2026-10-18T10:00:00Z',
 diagnosis:index%3===0?{code:'F41.1',label:'Γενικευμένη αγχώδης διαταραχή · συνθετικό παράδειγμα'}:null,
 draft:index%3===0?{id:'20000000-0000-4000-8000-'+String(index+1).padStart(12,'0')}:null,last_session:index===5?null:{completed_at:'2026-10-'+String(index+1).padStart(2,'0')+'T09:00:00Z'},
 next_appointment:index%2===0?{scheduled_start:'2026-10-25T14:00:00Z'}:null
}));
