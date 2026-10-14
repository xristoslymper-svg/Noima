import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEvaluation} from './support/render-copilot-evaluation.mjs';
test('public synthetic report escapes provider text and reports failures without claiming action execution',()=>{
 const html=renderEvaluation({status:'failed',results:[{patient:0,status:'failed',error:'<script>alert(1)</script>',answer:{blocks:[{title:'Example',text:'<img src=x onerror=alert(1)>',sources:[{label:'Synthetic',id:'s1',href:'javascript:alert(1)'}]}]}}],usage:{calls:1,input_tokens:4,output_tokens:2}});
 assert.ok(html.includes('Κατάσταση: failed'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes('<img '));
 assert.ok(!html.includes('href="javascript:'));
 assert.ok(html.includes('Δεν εκτελούνται ενέργειες'));
});
