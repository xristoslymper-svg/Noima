import {maxDocumentBytes,type DocumentCategory,type PatientDocument} from './types.ts';

export class DocumentValidationError extends Error {
 readonly code:'document_too_large'|'document_type'|'document_malformed'|'document_active_content'|'document_metadata';
 constructor(code:DocumentValidationError['code']){super(code);this.code=code}
}
const fail=(code:DocumentValidationError['code']):never=>{throw new DocumentValidationError(code)};
const signature=(bytes:Uint8Array,values:number[],offset=0)=>values.every((value,index)=>bytes[index+offset]===value);
const ascii=(bytes:Uint8Array)=>new TextDecoder('latin1').decode(bytes);
function dimensions(width:number,height:number){if(width<1||height<1||width>16000||height>16000||width*height>40_000_000)fail('document_malformed')}

// The allowlist deliberately excludes active HTML, SVG, archives and Office macros.
// Content and image dimensions are checked independently of browser MIME labels.
export function validateDocumentBytes(bytes:Uint8Array,declaredType:string,name:string):PatientDocument['media_type']{
 if(bytes.byteLength>maxDocumentBytes)fail('document_too_large');
 if(bytes.byteLength<12)fail('document_malformed');
 let actual:PatientDocument['media_type'];
 if(signature(bytes,[0x25,0x50,0x44,0x46,0x2d])){
  actual='application/pdf';const raw=ascii(bytes);
  if(!/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(raw)||!/%%EOF\s*$/.test(raw.slice(-1024)))fail('document_malformed');
  const decoded=raw.replace(/#([a-f\d]{2})/gi,(_,hex:string)=>String.fromCharCode(parseInt(hex,16)));
  if(/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|OpenAction|AA|SubmitForm|ImportData)\b/i.test(decoded))fail('document_active_content');
 }else if(signature(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])){
  actual='image/png';if(bytes.length<33||ascii(bytes.slice(12,16))!=='IHDR'||!ascii(bytes.slice(-20)).includes('IEND'))fail('document_malformed');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);dimensions(view.getUint32(16),view.getUint32(20));
 }else if(signature(bytes,[0xff,0xd8,0xff])){
  actual='image/jpeg';if(!signature(bytes,[0xff,0xd9],bytes.length-2))fail('document_malformed');
  let offset=2,found=false;
  while(offset+8<bytes.length){
   if(bytes[offset++]!==0xff)fail('document_malformed');
   while(bytes[offset]===0xff)offset++;
   const marker=bytes[offset++];if(marker===0xda||marker===0xd9)break;
   if(marker===0x01||marker>=0xd0&&marker<=0xd8)continue;
   const length=(bytes[offset]<<8)|bytes[offset+1];if(length<2||offset+length>bytes.length)fail('document_malformed');
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){dimensions((bytes[offset+5]<<8)|bytes[offset+6],(bytes[offset+3]<<8)|bytes[offset+4]);found=true;break}
   offset+=length;
  }
  if(!found)fail('document_malformed');
 }else if(ascii(bytes.slice(0,4))==='RIFF'&&ascii(bytes.slice(8,12))==='WEBP'){
  actual='image/webp';const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<30||view.getUint32(4,true)+8!==bytes.length)fail('document_malformed');
  const format=ascii(bytes.slice(12,16));
  if(format==='VP8X')dimensions(1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16));
  else if(format==='VP8 '&&signature(bytes,[0x9d,0x01,0x2a],23))dimensions(view.getUint16(26,true)&0x3fff,view.getUint16(28,true)&0x3fff);
  else if(format==='VP8L'&&bytes[20]===0x2f){const bits=view.getUint32(21,true);dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1)}
  else fail('document_malformed');
 }else return fail('document_type');
 if(declaredType&&declaredType!=='application/octet-stream'&&declaredType!==actual)fail('document_type');
 const ext=name.split('.').pop()?.toLowerCase();
 if(!({ 'application/pdf':['pdf'],'image/jpeg':['jpg','jpeg'],'image/png':['png'],'image/webp':['webp']}[actual].includes(ext||'')))fail('document_type');
 return actual;
}
export function validDocumentDate(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function safeDocumentName(name:string){return Array.from(name,character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127||character==='\\'||character==='/'?'_':character).join('').trim().slice(0,200)||'document.pdf'}
export function documentMetadata(input:{title?:unknown;category?:unknown;document_date?:unknown}){
 const title=typeof input.title==='string'?input.title.trim():'';
 const category=typeof input.category==='string'&&input.category?input.category:null;
 const date=typeof input.document_date==='string'&&input.document_date?input.document_date:null;
 if(title.length>200||category&&!['discharge','opinion','tests','history','other'].includes(category)||date&&!validDocumentDate(date))fail('document_metadata');
 return {title,category:category as DocumentCategory|null,document_date:date};
}
