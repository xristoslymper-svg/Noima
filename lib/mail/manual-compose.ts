/** The same human-sent mailto fallback used by the Library, without a mailbox/OAuth dependency. */
export type ManualCompose={to:string;subject:string;body:string};

export function manualQuestionnaireEmail(to:string,links:string[]):ManualCompose{
 if(!links.length||links.length>2)throw new Error('invalid_manual_invitation');
 const many=links.length>1;
 const body=[
  'Καλησπέρα σας,',
  '',
  many?'Το ιατρείο σας προσκαλεί να συμπληρώσετε τις παρακάτω φόρμες.':'Το ιατρείο σας προσκαλεί να συμπληρώσετε την παρακάτω φόρμα.',
  '',
  ...(many?links.flatMap((link,i)=>['Φόρμα '+(i+1)+':',link,'']):['Ανοίξτε τον προσωπικό σύνδεσμο:',links[0],'']),
  'Δεν χρειάζεται λογαριασμός. '+(many?'Οι σύνδεσμοι είναι προσωπικοί και λήγουν':'Ο σύνδεσμος είναι προσωπικός και λήγει')+' σε 14 ημέρες.',
  'Πατήστε «Υποβολή» στο τέλος κάθε φόρμας. Μην προωθείτε τους προσωπικούς συνδέσμους.',
  '',
  'Noima'
 ].join('\n');
 return {to,subject:'Συμπλήρωση φόρμας',body};
}

export function manualMailtoHref({to,subject,body}:ManualCompose):string{
 return 'mailto:'+encodeURIComponent(to)+'?'+new URLSearchParams({subject,body}).toString().replaceAll('+','%20');
}
