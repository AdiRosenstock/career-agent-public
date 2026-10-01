const byId = id => document.getElementById(id);
const allowed = new Set(['fullName','firstName','lastName','email','phone','linkedin','github','address','city','state','postalCode','school','degree','major','gpa','sat']);
let fields = null, tabId = null, pageUrl = null;
const status = text => { byId('status').textContent = text; };
function clearScan(){byId('matches').replaceChildren();byId('fill').hidden=true;tabId=null;pageUrl=null;}
function showProfile(){byId('identity').textContent=fields ? `Profile: ${fields.fullName || fields.email || 'Imported'}`:'No profile imported.';byId('scan').disabled=!fields;clearScan();}
function validate(data){
 if(data?.version!==1 || !data.fields || typeof data.fields!=='object' || Array.isArray(data.fields))throw Error('Choose the basic profile JSON exported by the dashboard.');
 const result={};for(const [key,value] of Object.entries(data.fields)){if(!allowed.has(key)||typeof value!=='string'||value.length>500)throw Error('Unexpected profile fields. Export a fresh basic profile.');result[key]=value;}
 if(!Object.values(result).some(Boolean))throw Error('The profile is empty.');return result;
}
async function restore(){try{await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});const data=await chrome.storage.local.get('profile');fields=data.profile?validate(data.profile):null;showProfile();}catch(e){status(e.message);}}
byId('profile').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>20000)throw Error('Profile file is too large.');const profile=JSON.parse(await file.text());fields=validate(profile);await chrome.storage.local.set({profile:{version:1,fields}});showProfile();status('Profile saved locally in this browser.');}catch(e){status(e.message);}finally{byId('profile').value='';}});
byId('delete').addEventListener('click',async()=>{await chrome.storage.local.remove('profile');fields=null;showProfile();status('Profile removed. Already filled form values are unchanged.');});
byId('scan').addEventListener('click',async()=>{
 clearScan();try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id || !/^https?:\/\//.test(tab.url||''))throw Error('Open an employer application in this browser first.');
 tabId=tab.id;pageUrl=tab.url;byId('site').textContent=`Page: ${new URL(tab.url).hostname}`;
 await chrome.scripting.executeScript({target:{tabId},files:['fields.js']});
 const [{result}]=await chrome.scripting.executeScript({target:{tabId},func: fields=>globalThis.careerFormHelper.scan(fields),args:[fields]});
 for(const item of result){const label=document.createElement('label');label.className='match';const check=document.createElement('input');check.type='checkbox';check.value=item.id;check.checked=true;const span=document.createElement('span');span.textContent=item.label;const value=document.createElement('small');value.textContent=item.value;span.append(value);label.append(check,span);byId('matches').append(label);}
 byId('fill').hidden=!result.length;status(result.length?`${result.length} matches. Check each proposed value before filling.`:'No supported blank fields found. Use the dashboard’s copy buttons for this page.');
 }catch(e){clearScan();status(`Unable to scan: ${e.message}`);}
});
byId('fill').addEventListener('click',async()=>{try{const tab=await chrome.tabs.get(tabId);if(tab.url!==pageUrl)throw Error('The page changed. Scan again.');const ids=[...byId('matches').querySelectorAll('input:checked')].map(e=>e.value);if(!ids.length){status('Select at least one field.');return;}
 const [{result}]=await chrome.scripting.executeScript({target:{tabId},func: ids=>globalThis.careerFormHelper.fill(ids),args:[ids]});clearScan();status(`Filled ${result.filled}; skipped ${result.skipped}. Review the form now. Nothing was submitted.`);
 }catch(e){clearScan();status(`Unable to fill: ${e.message}`);}});
void restore();
