import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {placeMedicationMenu} from '../lib/clinical/medication-menu-placement.ts';

const viewport={width:1280,height:800};

test('medication results open below the field when there is room',()=>{
 const p=placeMedicationMenu({left:60,top:160,bottom:198,width:190},viewport);
 assert.deepEqual(p,{left:60,top:204,width:310,maxHeight:270});
});

test('medication results flip above the field at the bottom of a short table/viewport',()=>{
 const p=placeMedicationMenu({left:60,top:690,bottom:730,width:190},viewport);
 assert.deepEqual(p,{left:60,top:414,width:310,maxHeight:270});
 assert.ok(p.top+p.maxHeight<=690);
});

test('medication results stay within narrow mobile viewports',()=>{
 const p=placeMedicationMenu({left:290,top:430,bottom:469,width:210},{width:320,height:640});
 assert.ok(p.left>=8);
 assert.ok(p.left+p.width<=312);
 assert.ok(p.top>=8);
 assert.ok(p.top+p.maxHeight<=632);
});

test('dropdown is portaled outside the horizontally scrolling medication table',()=>{
 const component=readFileSync('components/patients/MedicationTable.tsx','utf8');
 const css=readFileSync('app/globals.css','utf8');
 assert.match(component,/createPortal\(<div ref=\{menuRef\}/);
 assert.match(component,/,document\.body\)/);
 assert.match(component,/window\.addEventListener\('scroll',update,true\)/);
 assert.match(component,/aria-expanded=\{showMenu\}/);
 assert.match(css,/\.medication-search-menu\{position:fixed/);
 assert.doesNotMatch(css,/\.medication-search-menu\{position:absolute/);
});
