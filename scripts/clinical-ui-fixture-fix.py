from pathlib import Path
p=Path('browser-tests/clinical-cleanup.mjs');s=p.read_text()
s=s.replace("define:{'process.env.NODE_ENV':", "define:{'process.env':'{}','process.env.NODE_ENV':")
s=s.replace('const page=await context.newPage();const errors=[]','const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[]')
s=s.replace("page.on('pageerror',e=>errors.push(e.message))","page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.stack)})")
s=s.replace("report.tests.push({name,status:'failed',error:String(e.stack||e)})","report.tests.push({name,status:'failed',error:String(e.stack||e),errors})")
p.write_text(s)
p=Path('components/patients/MseDomain.tsx');s=p.read_text().replace("(field.text?'has-value ':'')","(preview?'has-value ':'')").replace(':field.text.trim()?<button',':preview?<button');p.write_text(s)
p=Path('app/clinical-editor.css');s=p.read_text().replace('.visit-workspace .visit-medication {','.visit-workspace .medication-table-editor {');s+='\n/* Medication and plain input surfaces share the editor palette, without changing status chips. */\n.visit-workspace .medication-table-editor {border:1px solid var(--clinical-field-border);border-radius:12px;}\n.visit-workspace .medication-table-editor :is(table,tbody,tr,td,th) {background:transparent;}\n.visit-workspace :is(input:not([type=checkbox]):not([type=radio]),select) {background:var(--clinical-field-surface);}\n';p.write_text(s)
