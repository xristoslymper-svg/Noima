import {intlTestModule} from './helpers/i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function hook(enabled,matches){
 const effects=[],writes=[],listeners=new Set();let queries=0;
 const media={matches,addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn)};
 const module={exports:{}};
 vm.runInNewContext(compile('components/mobile/useMobileCalendarLayout.ts'),{module,exports:module.exports,window:{matchMedia:q=>{assert.equal(q,'(max-width:760px)');queries++;return media}},require:(id)=>(intlTestModule(id)??(id=>id==='react'?{useState:initial=>[initial,v=>writes.push(v)],useEffect:fn=>effects.push(fn)}:{mobileV2Enabled:enabled})(id))});
 const initial=module.exports.useMobileCalendarLayout();const cleanup=effects[0]();
 return {initial,writes,media,listeners,cleanup,queries};
}
test('desktop/default builds never subscribe to or activate the mobile calendar',()=>{
 const m=hook(false,true);assert.equal(m.initial,false);assert.equal(m.queries,0);assert.equal(m.listeners.size,0);assert.deepEqual(m.writes,[]);
});
test('opted-in calendar follows the viewport and cleans up its listener',()=>{
 const m=hook(true,false);assert.equal(m.initial,false);assert.deepEqual(m.writes,[false]);
 m.media.matches=true;for(const listener of m.listeners)listener();assert.deepEqual(m.writes,[false,true]);
 m.media.matches=false;for(const listener of m.listeners)listener();assert.deepEqual(m.writes,[false,true,false]);m.cleanup();assert.equal(m.listeners.size,0);
});
const controls={exports:{}};
new Function('require','module','exports',compile('components/mobile/MobileCalendarControls.tsx'))((id)=>(
 intlTestModule(id)??(
  id==='@/components/calendar/CalendarPatientSearch'
   ? {__esModule:true,default:()=>React.createElement('input',{'aria-label':'Αναζήτηση ασθενή'})}
   : id.endsWith('.css')?{}:require(id)
 )
),controls,controls.exports);
test('compact controls retain date, all status filters, refresh and both calendar views',()=>{
 const html=renderToStaticMarkup(React.createElement(controls.exports.default,{date:'2026-10-13',today:'2026-10-13',days:[{key:'2026-10-13',day:'Τρί',date:'13 Οκτ'}],view:'day',filter:'all',patients:[],onDate(){},onPrevious(){},onNext(){},onView(){},onFilter(){},onRefresh(){},onNew(){}}));
 for(const value of ['current','scheduled','completed','cancelled','all'])assert.match(html,new RegExp('value="'+value+'"'));
 for(const label of ['Μετάβαση σε ημερομηνία','Ανανέωση ημερολογίου','Προηγούμενη ημερομηνία','Επόμενη ημερομηνία','Ημέρες ημερολογίου','Νέο ραντεβού'])assert.ok(html.includes(label));
 assert.ok(html.includes('Ημέρα')&&html.includes('Εβδομάδα'));assert.ok(html.includes('Αναζήτηση ασθενή'));assert.match(html,/<details[^>]*>/);assert.doesNotMatch(html,/<details[^>]* open/);
});
