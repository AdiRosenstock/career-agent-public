// This file runs only after the user explicitly scans the active tab.
(() => {
 if (globalThis.careerFormHelper) return;
 const aliases = {
  fullName: ['full name','legal name','your name'], firstName: ['first name','legal first name','given name'], lastName: ['last name','legal last name','family name','surname'],
  email: ['email','email address','e mail','university email address'], phone: ['phone','phone number','mobile phone','mobile number','telephone'],
  linkedin: ['linkedin','linkedin url','linkedin profile','linkedin profile url'], github: ['github','github url','github profile'],
  address: ['address line 1','street address'], city: ['city','town'], state: ['state','province'], postalCode: ['postal code','zip','zip code'],
  school: ['school','university','school or university'], degree: ['degree'], major: ['major','field of study','discipline'], gpa: ['gpa','overall result gpa','cumulative gpa'], sat: ['sat score','what was your sat score'],
 };
 const normalize = s => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+(required|optional)$/,'');
 let scanned = new Map();
 let serial = 0;
 function classify(el) {
  if (!['text','email','tel','url','search',''].includes(el.type) || el.disabled || el.readOnly || el.value.trim() || !el.getClientRects().length || el.closest('[hidden],[inert]')) return null;
  const labels = [...(el.labels || [])].map(l=>l.textContent || '');
  const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id=>document.getElementById(id)?.textContent || '').filter(Boolean);
  const texts = [...labels,...labelledBy,el.getAttribute('aria-label') || ''].filter(Boolean);
  // Use fallback hints only when the form has no actual label. Never infer a question from autocomplete alone.
  const hints = texts.length ? texts : [el.placeholder || '',el.name.replace(/([a-z])([A-Z])/g,'$1 $2')];
  const matches = new Set(hints.map(normalize).flatMap(t=>Object.entries(aliases).filter(([,list])=>list.includes(t)).map(([key])=>key)));
  if (matches.size !== 1 || (texts.length && texts.some(t=>!Object.values(aliases).flat().includes(normalize(t))))) return null;
  return {key:[...matches][0], label: texts.join(' / ') || el.placeholder || el.name};
 }
 globalThis.careerFormHelper = {
  scan(fields) {
   scanned = new Map(); const result=[];
   for (const el of document.querySelectorAll('input')) {
    const match=classify(el); if (!match || !fields[match.key]) continue;
    const id=String(++serial); const value=fields[match.key];
    if(typeof value!=='string' || value.length>500) continue;
    scanned.set(id,{el,...match,value}); result.push({id,label:match.label,value});
   }
   return result;
  },
  fill(ids) {
   let filled=0, skipped=0;
   for(const id of new Set(ids)) {
    const item=scanned.get(id); if(!item){skipped++;continue;}
    const current=classify(item.el);
    if(!item.el.isConnected || !current || current.key!==item.key || current.label!==item.label || (item.el.maxLength>=0 && item.value.length>item.el.maxLength)){skipped++;continue;}
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(item.el,item.value);
    item.el.dispatchEvent(new Event('input',{bubbles:true})); item.el.dispatchEvent(new Event('change',{bubbles:true}));
    if(item.el.value===item.value)filled++;else skipped++;
   }
   scanned.clear();return {filled,skipped};
  }
 };
})();
