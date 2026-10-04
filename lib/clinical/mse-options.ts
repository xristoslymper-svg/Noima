export type MseAxis = {label:string;options:string[];multiple?:boolean};
export const mseAxes:Record<string,MseAxis[]>={
 appearance:[{label:'Περιποίηση',options:['Επαρκής','Παραμελημένη']},{label:'Στάση',options:['Ήρεμη','Επιφυλακτική','Αμυντική']},{label:'Βλεμματική επαφή',options:['Διατηρημένη','Περιορισμένη','Μεταβαλλόμενη']},{label:'Ψυχοκινητικότητα',options:['Χωρίς εμφανή διαταραχή','Επιβράδυνση','Διέγερση']},{label:'Συνεργασία',options:['Καλή','Περιορισμένη','Μεταβαλλόμενη']}],
 speech:[{label:'Ποσότητα',options:['Συνήθης','Μειωμένη','Αυξημένη']},{label:'Ρυθμός',options:['Συνήθης','Βραδύς','Ταχύς']},{label:'Ένταση',options:['Συνήθης','Χαμηλή','Αυξημένη']},{label:'Λανθάνων χρόνος',options:['Συνήθης','Αυξημένος']},{label:'Λόγος',options:['Αυθόρμητος','Πιεστικός','Πτωχός']}],
 mood:[{label:'Υποκειμενικό συναίσθημα',options:['Ευθυμικό','Καταθλιπτικό','Αγχώδες','Ευερέθιστο','Ανεβασμένο'],multiple:true}],
 affect:[{label:'Εύρος',options:['Πλήρες','Περιορισμένο','Αμβλύ','Επίπεδο']},{label:'Ένταση',options:['Συνήθης','Μειωμένη','Αυξημένη']},{label:'Κινητικότητα',options:['Σταθερή','Μεταβλητή','Ευμετάβλητη']},{label:'Ποιότητα',options:['Αγχώδης','Καταθλιπτική','Ευερέθιστη','Ευφορική'],multiple:true},{label:'Συμφωνία με περιεχόμενο',options:['Σύμφωνο','Ασύμφωνο']}],
 thought_process:[{label:'Μορφή σκέψης',options:['Γραμμική / λογική','Εφαπτομενικότητα','Περιφραστικότητα (circumstantiality)','Φυγή ιδεών','Χάλαση συνειρμών','Ανακοπή σκέψης','Αποδιοργάνωση'],multiple:true}],
 thought_content:[{label:'Περιεχόμενο',options:['Παραληρητικές ιδέες','Ιδέες αναφοράς','Υπερτιμημένες ιδέες','Ιδεοληψίες','Φοβίες'],multiple:true}],
 perception:[{label:'Αντίληψη',options:['Δεν αναφέρονται διαταραχές','Ψευδαισθήσεις','Παραισθήσεις','Άλλες διαταραχές'],multiple:true}],
 cognition:[{label:'Συνείδηση',options:['Εγρήγορση','Υπνηλία','Σύγχυση']},{label:'Προσανατολισμός',options:['Πλήρης','Μερικός','Διαταραγμένος']},{label:'Προσοχή / συγκέντρωση',options:['Διατηρημένη','Μειωμένη']},{label:'Μνήμη',options:['Χωρίς εμφανή δυσκολία','Αναφερόμενη δυσκολία','Παρατηρούμενη δυσκολία']},{label:'Εκτελεστικές λειτουργίες / αφαίρεση',options:['Διατηρημένες','Δυσκολία']}],
 insight:[{label:'Επίγνωση συμπτωμάτων / ανάγκης θεραπείας',options:['Καλή','Μερική','Περιορισμένη']}],
 judgment:[{label:'Κρίση / λήψη αποφάσεων',options:['Διατηρημένη','Περιορισμένη','Διαταραγμένη']}],
 impulse_control:[{label:'Έλεγχος παρορμήσεων',options:['Διατηρημένος','Μειωμένος']}],
 reliability:[{label:'Αξιοπιστία πληροφοριών',options:['Επαρκής','Περιορισμένη','Αβέβαιη']}],
};
// Choice lines use the existing canonical narrative field; arbitrary clinical text is never discarded.
function choiceLine(line:string,axis:MseAxis):boolean{return line.startsWith(axis.label+': ')&&line.slice(axis.label.length+2).split(' · ').every(value=>axis.options.includes(value))}
export function axisValues(text:string,axis:MseAxis):string[]{const line=text.split('\n').find(line=>choiceLine(line,axis));return line?line.slice(axis.label.length+2).split(' · '):[]}
export function mseNote(text:string,key:string):string{
 return text.split('\n').filter(line=>!(mseAxes[key]||[]).some(axis=>choiceLine(line,axis))).join('\n');
}
export function replaceMseNote(text:string,key:string,note:string):string{
 const choices=text.split('\n').filter(line=>(mseAxes[key]||[]).some(axis=>choiceLine(line,axis)));
 return [...choices,...(note?[note]:[])].join('\n');
}
export function toggleMseChoice(text:string,axis:MseAxis,option:string):string{
 const previous=axisValues(text,axis);const values=previous.includes(option)?previous.filter(v=>v!==option):axis.multiple?[...previous,option]:[option];
 if(axis.label==='Αντίληψη'&&option==='Δεν αναφέρονται διαταραχές'&&values.includes(option))values.splice(0,values.length,option);else if(axis.label==='Αντίληψη'&&option!=='Δεν αναφέρονται διαταραχές'){const absent=values.indexOf('Δεν αναφέρονται διαταραχές');if(absent>=0)values.splice(absent,1)}
 const lines=text.split('\n');const index=lines.findIndex(line=>choiceLine(line,axis));const next=axis.label+': '+values.join(' · ');
 if(index>=0){if(values.length)lines[index]=next;else lines.splice(index,1)}else if(values.length)lines.push(next);
 return lines.join('\n').replace(/^\n/,'');
}
