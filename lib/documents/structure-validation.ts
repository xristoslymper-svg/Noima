import {PDFArray,PDFDict,PDFDocument,PDFName,PDFRawStream,type PDFObject} from 'pdf-lib';
import sharp from 'sharp';
import type {PatientDocument} from './types.ts';
import {DocumentValidationError} from './validation.ts';

const activeNames=new Set(['JavaScript','JS','Launch','EmbeddedFile','RichMedia','XFA','OpenAction','AA','SubmitForm','ImportData']);
function reject():never{throw new DocumentValidationError('document_malformed')}

/** Decode the actual document; a valid magic header alone is not an upload. */
export async function validateDocumentStructure(bytes:Uint8Array,mediaType:PatientDocument['media_type']):Promise<{pages:number}>{
 try{
  if(mediaType!=='application/pdf'){
   const image=sharp(bytes,{failOn:'error',limitInputPixels:40_000_000,animated:false});
   const metadata=await image.metadata();
   if(!metadata.width||!metadata.height||metadata.width*metadata.height>40_000_000||(metadata.pages||1)>1)reject();
   // metadata() does not decode pixel data: actually decode a bounded thumbnail
   // so truncated/corrupt image payloads cannot pass a signature-only check.
   await image.resize({width:1,height:1,fit:'inside'}).png().toBuffer();
   return {pages:1};
  }
  const pdf=await PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});
  const pages=pdf.getPages();
  if(pages.length<1||pages.length>100||pdf.catalog.get(PDFName.of('Type'))?.toString()!=='/Catalog')reject();
  for(const page of pages){const {width,height}=page.getSize();if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>50000||height>50000)reject()}
  const objects=pdf.context.enumerateIndirectObjects();if(objects.length>20000)reject();
  const visited=new Set<PDFObject>();
  function inspect(object:PDFObject,depth=0){
   if(depth>100)reject();if(visited.has(object))return;visited.add(object);
   if(object instanceof PDFName&&activeNames.has(object.decodeText()))throw new DocumentValidationError('document_active_content');
   if(object instanceof PDFRawStream)inspect(object.dict,depth+1);
   if(object instanceof PDFDict)for(const [key,value] of object.entries()){inspect(key,depth+1);inspect(value,depth+1)}
   if(object instanceof PDFArray)for(const value of object.asArray())inspect(value,depth+1);
  }
  // pdf-lib resolves objects inside compressed object streams as well, exposing
  // action dictionaries which a raw-byte regexp alone cannot detect.
  for(const [,object] of objects)inspect(object);
  return {pages:pages.length};
 }catch(error){if(error instanceof DocumentValidationError)throw error;return reject()}
}
