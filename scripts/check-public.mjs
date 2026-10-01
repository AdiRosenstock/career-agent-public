/** Release hygiene, not a substitute for a dedicated secret scanner or manual review. */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
const ref=process.argv.find(x=>x.startsWith('--ref='))?.slice(6);
const git=(args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const files=(ref?git(['ls-tree','-r','--name-only',ref]):git(['ls-files'])).trim().split('\n').filter(Boolean);
const prohibited=/(^|\/)(?:\.data|tmp|output|node_modules|dist)(?:\/|$)|^--file$|\.(?:pdf|csv|sqlite(?:3)?(?:-\w+)?|db|pem|key|bundle|zip|tar(?:\.gz)?)$|(^|\/)\.env(?:\..*)?$/i;
const checks=[
 ['credential-like value', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/],
 ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['personal university email', /[A-Za-z0-9._%+-]+@u\.northwestern\.edu/i],
 ['personal home path', /\/Users\/[a-z][a-z0-9_-]+\/(?:Desktop|Downloads)\//i],
];
const failures=[];
for(const file of files){
 if(file!=='.env.example'&&prohibited.test(file)){failures.push(`${file}: private/generated file tracked`);continue;}
 if(!ref&&!existsSync(file))continue;
 const bytes=ref?execFileSync('git',['show',`${ref}:${file}`],{maxBuffer:32*1024*1024}):readFileSync(file);
 if(bytes.includes(0))continue;
 for(const [label,pattern] of checks)if(pattern.test(bytes.toString('utf8')))failures.push(`${file}: ${label}`);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`Public-file hygiene passed for ${files.length} tracked files${ref?` at ${ref}`:''}. Review screenshots and history separately.`);
