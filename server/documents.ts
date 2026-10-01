import { readFile, stat, lstat, mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CandidateDocument } from '../shared/types.js';
import type { Runtime } from './runtime.js';

const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const inputSchema=z.object({path:z.string().min(1),kind:z.enum(['transcript','recommendation']),label:z.string().min(1).max(200).optional(),documentDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),notes:z.string().max(5000).optional()}).strict();

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
 const sha256=digest(bytes);const state=await rt.store.read();
 const existing=state.profile.documents?.find(d=>d.sha256===sha256&&d.kind===supplied.kind);
 if(existing){await verifiedDocumentBytes(existing);return existing;}
 const directory=path.join(dataDirectory,'artifacts','supporting');await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
 const captured=path.join(directory,`${supplied.kind}-${sha256}.pdf`);
 try{await writeFile(captured,bytes,{mode:0o600,flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 await chmod(captured,0o600);
 const document:CandidateDocument={id:randomUUID(),kind:supplied.kind,label:supplied.label||path.basename(source,'.pdf'),filename:path.basename(source),path:captured,originalPath:source,sha256,addedAt:new Date().toISOString(),documentDate:supplied.documentDate??null,notes:supplied.notes||''};
 await verifiedDocumentBytes(document);
 await rt.engine.updateProfile({documents:[...(state.profile.documents||[]),document]});
 return document;
}
