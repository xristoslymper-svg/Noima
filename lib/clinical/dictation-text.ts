export const MAX_DICTATION_TEXT=20000;
// Text segments are clinician reviewed; never infer, deduplicate or reorder words.
export function appendDictationText(accepted:string,next:string){
 const text=[accepted.trim(),next.trim()].filter(Boolean).join('\n\n');
 if(text.length>MAX_DICTATION_TEXT)throw new Error('Το κείμενο ξεπερνά το όριο των 20.000 χαρακτήρων. Χρησιμοποιήστε το υπάρχον κείμενο πριν συνεχίσετε.');
 return text;
}
