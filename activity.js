"use strict";
// Anonymous tab sessions. Never record form values, raw URLs, viewing keys or IPs.
(()=>{
 if(typeof IS_DEMO!=="undefined"&&IS_DEMO)return;
 let saved=null;try{saved=JSON.parse(sessionStorage.getItem('lead-map-visit')||'null')}catch{}
 const code=params.get('company')||'',company=/^[A-Za-z0-9_-]{1,64}$/.test(code)?code:'';
 const valid=saved&&/^[0-9a-f-]{36}$/i.test(saved.id)&&Date.now()-saved.updated<1800000&&(saved.company||'')===company;
 const id=valid?saved.id:crypto.randomUUID();
 let active=valid?Number(saved.active)||0:0,lastTick=performance.now(),lastInput=lastTick,queue=[],sending=false,lastSent=-1;
 const device=matchMedia('(max-width: 760px)').matches?'mobile':'desktop';
 const persist=()=>{try{sessionStorage.setItem('lead-map-visit',JSON.stringify({id,company,active,updated:Date.now()}))}catch{}};
 function tick(){const now=performance.now();if(document.visibilityState==='visible'&&now-lastInput<60000)active=Math.min(86400000,active+Math.max(0,Math.min(now-lastTick,5000)));lastTick=now;persist();}
 function track(kind,meta={}){tick();queue.push({event_id:crypto.randomUUID(),kind,page:'map',active_ms:Math.round(active),...meta});if(queue.length>100)queue.shift();if(kind!=='heartbeat')flush();}
 async function flush(keepalive=false){
  if(sending||!queue.length)return;sending=true;const batch=queue.slice(0,20);
  try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','x-lead-map-key':TOKEN},body:JSON.stringify({api:'activity',visit_id:id,device,company_code:company,events:batch}),keepalive,referrerPolicy:'no-referrer',cache:'no-store',credentials:'omit'});if(r.ok)queue.splice(0,batch.length);}catch{}finally{sending=false;}
 }
 window.LeadMapActivity={id,track};persist();track('page_view');
 for(const name of ['pointerdown','keydown','touchstart','scroll'])window.addEventListener(name,()=>{lastInput=performance.now()},{passive:true,capture:true});
 setInterval(tick,5000);
 setInterval(()=>{tick();if(Math.round(active)!==lastSent){lastSent=Math.round(active);track('heartbeat');}flush();},15000);
 document.addEventListener('visibilitychange',()=>{tick();if(document.visibilityState!=='visible'){track('heartbeat');flush(true)}else lastInput=performance.now()});
 window.addEventListener('pagehide',()=>{tick();track('heartbeat');flush(true)});
 document.addEventListener('click',e=>{
  const el=e.target.closest?.('button,a,summary');if(!el)return;
  let action=el.dataset.contactAction||({go:'search',loadMore:'load_more',refresh:'refresh',addCaseFilter:'filter_add',clearCaseFilters:'filter_clear',contactSubmit:'submit',contactClose:'close_form',japan:'national'})[el.id];
  if(!action&&el.hasAttribute('data-remove-filter'))action='filter_remove';
  if(!action&&el.matches('a[href^="https://calendar.app.google/"]'))action='calendar';
  if(!action&&el.matches('a[href="#casePanel"]'))action='list_jump';
  if(!action&&el.closest('#cityChoices'))action='city';
  if(!action&&(el.closest('#prefCounts')||el.classList.contains('leaflet-marker-icon')))action='prefecture';
  if(!action&&el.matches('.more summary'))action='other_details';
  const placement=el.closest('#campaignBanner')?'cta:campaign':el.closest('.lead-record-body')?'cta:case_detail':el.closest('.lead-record')?'cta:case_summary':el.closest('.case-inquiry-break')?'cta:list_break':el.closest('#stickyContactNav')?'cta:sticky':el.closest('.service-entry')?'cta:area':el.closest('#serviceContact')?'cta:service':'';
  if(action)track('button_click',{action,case_id:el.dataset.contactId||'',area:typeof view!=='undefined'?view.label:'',...(placement?{field:placement}:{})});
 },true);
})();
