import { readFile, stat, lstat, mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CandidateDocument } from '../shared/types.js';
import type { Runtime } from './runtime.js';

const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const kindSchema=z.enum(['transcript','recommendation','base_cover_letter']);
const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const inputSchema=z.object({path:z.string().min(1),kind:kindSchema,label:z.string().min(1).max(200).optional(),documentDate:dateSchema.optional(),notes:z.string().max(5000).optional()}).strict();
const uploadSchema=z.object({filename:z.string().min(1).max(255),base64:z.string().min(1).max(28_000_000),kind:kindSchema,label:z.string().min(1).max(200).optional(),documentDate:dateSchema.optional(),notes:z.string().max(5000).optional()}).strict();

export async function verifiedDocumentBytes(document:CandidateDocument):Promise<Buffer>{
 const info=await lstat(document.path);
 if(!info.isFile()||info.isSymbolicLink()||info.size>20*1024*1024)throw new Error('Supporting document is not a valid local file.');
 const bytes=await readFile(document.path);
 if(bytes.length!==info.size||bytes.subarray(0,5).toString('ascii')!=='%PDF-'||digest(bytes)!==document.sha256)throw new Error('Supporting document is missing or changed. Restore the unchanged original.');
 return bytes;
}

/** Copies only user-supplied PDFs; never rewrites or transmits their contents. */
export async function registerDocument(rt:Runtime,dataDirectory:string,input:unknown):Promise<CandidateDocument>{
 const supplied=inputSchema.parse(input);const source=path.resolve(supplied.path);
 const before=await stat(source);if(!before.isFile()||before.size>20*1024*1024)throw new Error('Provide a PDF file under 20 MB.');
 const bytes=await readFile(source);const after=await stat(source);
 if(bytes.length!==before.size||bytes.length<5||before.size!==after.size||before.mtimeMs!==after.mtimeMs||bytes.subarray(0,5).toString('ascii')!=='%PDF-')throw new Error('PDF is not fully downloaded or changed while being read. Download the complete file before trying again.');
 return captureDocument(rt,dataDirectory,{filename:path.basename(source),kind:supplied.kind,label:supplied.label,documentDate:supplied.documentDate,notes:supplied.notes,originalPath:source},bytes);
}

/** Browser upload: keep the original PDF bytes and filename in private storage. */
export async function registerDocumentUpload(rt:Runtime,dataDirectory:string,input:unknown):Promise<CandidateDocument>{
 const supplied=uploadSchema.parse(input);
 if(path.basename(supplied.filename)!==supplied.filename||/[\\/\x00-\x1f]/.test(supplied.filename)||!/\.pdf$/i.test(supplied.filename))throw new Error('Choose a PDF with a valid filename.');
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(supplied.base64))throw new Error('The uploaded PDF is invalid.');
 const bytes=Buffer.from(supplied.base64,'base64');
 if(bytes.length<5||bytes.length>20*1024*1024||bytes.subarray(0,5).toString('ascii')!=='%PDF-')throw new Error('Choose a complete PDF under 20 MB.');
 return captureDocument(rt,dataDirectory,{filename:supplied.filename,kind:supplied.kind,label:supplied.label,documentDate:supplied.documentDate,notes:supplied.notes},bytes);
}

async function captureDocument(rt:Runtime,dataDirectory:string,metadata:{filename:string;kind:CandidateDocument['kind'];label?:string;documentDate?:string|null;notes?:string;originalPath?:string},bytes:Buffer):Promise<CandidateDocument>{
 const sha256=digest(bytes);
 const directory=path.join(dataDirectory,'artifacts','supporting');await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
 const captured=path.join(directory,`${metadata.kind}-${sha256}.pdf`);
 try{await writeFile(captured,bytes,{mode:0o600,flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 await chmod(captured,0o600);
 const document:CandidateDocument={id:randomUUID(),kind:metadata.kind,label:metadata.label||path.basename(metadata.filename,'.pdf'),filename:metadata.filename,path:captured,originalPath:metadata.originalPath||captured,sha256,addedAt:new Date().toISOString(),documentDate:metadata.documentDate??null,notes:metadata.notes||''};
 await verifiedDocumentBytes(document);
 return rt.engine.addDocument(document);
}
