"use strict";
(()=>{
 const node=id=>document.getElementById(id);
 if(!TOKEN)node('publicIntro').hidden=false;
 let scheduled=false,firstReady=true,entryTouched=false;
 const entryAnchor=location.hash||'';
 window.addEventListener('pointerdown',()=>{entryTouched=true},{once:true,passive:true});
 function syncContactNav(){
  const list=node('casePanel').getBoundingClientRect(),contact=node('serviceContact').getBoundingClientRect();
  const dialog=node('contactDialog');
  node('stickyContactNav').hidden=!snapshot||list.top>window.innerHeight*.6||contact.top<window.innerHeight||dialog.open;
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncContactNav()})}
 window.LeadMapExperience={ready(){if(!firstReady)return;firstReady=false;const id=entryAnchor.slice(1);if(!entryTouched&&['serviceContact','serviceFAQ','casePanel','searchSection','campaignBanner'].includes(id))node(id)?.scrollIntoView({behavior:'auto',block:'start'});},areaChanged(label,count){node('areaContactTitle').textContent=label==='全国'?'御社のエリアで、紹介を受けられるか確認':label+'の紹介条件を確認';node('stickyContactLabel').textContent=(label==='全国'?'御社のエリア':label)+'・見込案件 '+fmt(count)+'件';schedule();}};
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});
 document.addEventListener('click',()=>setTimeout(schedule,0));
 node('contactDialog').addEventListener('close',schedule);
 function renderCampaign(c,demo=false){
  const read=(key,max)=>typeof c?.[key]==='string'?c[key].slice(0,max):'';
  const title=read('title',80),body=read('body',500),terms=read('terms',300),label=read('cta_label',40),action=['materials','trial','conditions'].includes(c?.cta_action)?c.cta_action:'conditions';
  for(const [id,text] of [['campaignTitle',title||'キャンペーンのご案内がここに表示されます'],['campaignBody',body||'地域の案件数を確認したあと、案件一覧へ進む前にご案内を掲載します。'],['campaignTerms',terms||'表示確認用のデモです。特典・割引の適用や、お申し込みの受付は行いません。'],['campaignButton',label||'対象条件を確認する']])node(id).textContent=text;
  node('campaignButton').dataset.contactAction=action;
  const end=read('ends_on',10);node('campaignDeadline').textContent=/^\d{4}-\d{2}-\d{2}$/.test(end)?'受付期間：'+end.replaceAll('-','/')+'まで':'';
  node('campaignDemoLabel').hidden=!demo;node('campaignBanner').classList.toggle('is-demo',demo);node('campaignBanner').hidden=false;
 }
 async function loadCampaign(){
  try{const config=await call({api:'site_config'}),c=config.campaign;const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
   if(!c?.enabled||c.ends_on&&c.ends_on<today)return;
   if(!['materials','trial','conditions'].includes(c.cta_action))return;
   renderCampaign(c);
  }catch{/* The map and contact flow remain usable when the announcement is unavailable. */}
 }
 if(IS_DEMO){
  node('demoNotice').hidden=false;renderCampaign({},true);
  document.addEventListener('click',e=>{const a=e.target.closest?.('a');if(a&&(a.href.startsWith('mailto:')||a.href.startsWith('https://calendar.app.google/'))){e.preventDefault();node('contactReceiptNote').textContent='デモ画面からメールや予約ページへの移動は行いません。通常のサイトをご利用ください。';}},true);
  window.addEventListener('message',e=>{
   if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='lead-map-campaign-preview')return;
   renderCampaign(e.data.campaign,true);if(e.data.scroll)node('campaignBanner').scrollIntoView({behavior:'auto',block:'center'});
  });
 }else loadCampaign();
 const invite=node('seasonalInvite'),today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);let dismissed=false;
 try{dismissed=sessionStorage.getItem('lead-map-seasonal-2027')==='closed'}catch{}
 if(invite&&!IS_DEMO&&!dismissed&&today>='2026-11-16'&&today<='2027-01-31')setTimeout(()=>{if(document.visibilityState==='visible'&&!node('contactDialog').open)invite.hidden=false},45000);
 node('closeSeasonalInvite')?.addEventListener('click',()=>{invite.hidden=true;try{sessionStorage.setItem('lead-map-seasonal-2027','closed')}catch{}});
 document.addEventListener('click',e=>{if(e.target.closest?.('#seasonalInvite [data-contact-action]'))invite.hidden=true});
})();
