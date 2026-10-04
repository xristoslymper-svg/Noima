// This readable cookie is a UI hint only. The server derives ownership from verified Auth.
export function getDemoTesterId() {
 if(typeof document==='undefined') return '';
 return document.cookie.split('; ').find(row=>row.startsWith('noima-workspace-id='))?.split('=')[1]||'';
}
