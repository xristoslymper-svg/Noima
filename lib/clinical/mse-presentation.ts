import type {DocumentField} from './visit-document';

// Reuse the terminology already shown in the clinical card. Stored labels stay intact.
const labels:Record<string,string>={appearance:'Εμφάνιση & συμπεριφορά',speech:'Λόγος',mood:'Συναίσθημα',affect:'Συναισθηματική έκφραση',thought_process:'Ροή σκέψης',thought_content:'Περιεχόμενο σκέψης',perception:'Αντίληψη',cognition:'Γνωστικές λειτουργίες',insight:'Επίγνωση',judgment:'Κρίση',impulse_control:'Έλεγχος παρορμήσεων',reliability:'Αξιοπιστία'};
export function mseDomainLabel(field:DocumentField){return labels[field.key]||field.label}
// Only flatten whitespace for display; never derive findings or mutate the document.
export function mseRecordedPreview(field:DocumentField){return field.text.trim().replace(/\s+/gu,' ')}
