"use strict";
(()=>{
 const node=id=>document.getElementById(id);
 if(!TOKEN)node('publicIntro').hidden=false;
 let scheduled=false;
 function syncContactNav(){
  const list=node('casePanel').getBoundingClientRect(),contact=node('serviceContact').getBoundingClientRect();
  const dialog=node('contactDialog');
  node('stickyContactNav').hidden=!snapshot||list.top>window.innerHeight*.6||contact.top<window.innerHeight||dialog.open;
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncContactNav()})}
 window.LeadMapExperience={areaChanged(label,count){node('areaContactTitle').textContent=label==='全国'?'御社のエリアで、紹介を受けられるか確認':label+'の紹介条件を確認';node('stickyContactLabel').textContent=(label==='全国'?'御社のエリア':label)+'・見込案件 '+fmt(count)+'件';schedule();}};
 window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});
 document.addEventListener('click',()=>setTimeout(schedule,0));
 node('contactDialog').addEventListener('close',schedule);
 async function loadCampaign(){
  try{const config=await call({api:'site_config'}),c=config.campaign;const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
   if(!c?.enabled||c.ends_on&&c.ends_on<today)return;
   if(!['materials','trial','conditions'].includes(c.cta_action))return;
   for(const [id,field] of [['campaignTitle','title'],['campaignBody','body'],['campaignTerms','terms'],['campaignButton','cta_label']])node(id).textContent=c[field]||'';
   node('campaignButton').dataset.contactAction=c.cta_action;
   node('campaignDeadline').textContent=c.ends_on?'受付期間：'+c.ends_on.replaceAll('-','/')+'まで':'';node('campaignBanner').hidden=false;
  }catch{/* The map and contact flow remain usable when the announcement is unavailable. */}
 }
 loadCampaign();
})();
