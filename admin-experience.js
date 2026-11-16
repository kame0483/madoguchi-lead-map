"use strict";
let crmSearchRows=[],campaignLoaded=false,campaignLoading=false,campaignSaving=false;
const campaignInputs={title:'campaignEditTitle',body:'campaignEditBody',terms:'campaignEditTerms',cta_label:'campaignEditLabel',cta_action:'campaignEditAction',ends_on:'campaignEditEnd'};
function campaignValues(){return {enabled:el('campaignEnabled').checked,...Object.fromEntries(Object.entries(campaignInputs).map(([k,id])=>[k,el(id).value.trim()]))};}
function previewCampaign(){const c=campaignValues();for(const [id,key] of [['campaignPreviewTitle','title'],['campaignPreviewBody','body'],['campaignPreviewTerms','terms'],['campaignPreviewButton','cta_label']])el(id).textContent=c[key]||({title:'キャンペーンの見出し',body:'ご案内内容',terms:'対象・適用条件',cta_label:'ボタン文言'})[key];el('campaignPreviewEnd').textContent=c.ends_on?'受付期間：'+c.ends_on.replaceAll('-','/')+'まで':'';}
async function loadCampaignSettings(force=false){
 if(campaignLoading||campaignSaving||campaignLoaded&&!force)return;campaignLoading=true;el('campaignForm').querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);el('campaignAdminStatus').textContent='設定を読み込んでいます…';
 try{const r=await api({api:'admin_site_config'}),c=r.campaign||{};el('campaignEnabled').checked=c.enabled===true;for(const [k,id] of Object.entries(campaignInputs))el(id).value=c[k]|| (k==='cta_action'?'conditions':'');campaignLoaded=true;previewCampaign();el('campaignAdminStatus').textContent=c.enabled?'保存済みの表示設定を読み込みました。':'現在の案内は非表示です。内容を入力し、表示を有効にして保存できます。';}
 catch(e){el('campaignAdminStatus').textContent=e.message||'設定を読み込めませんでした。';}finally{campaignLoading=false;el('campaignForm').querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=false);}
}
el('reloadCampaign').addEventListener('click',()=>loadCampaignSettings(true));
el('campaignForm').addEventListener('input',previewCampaign);
el('campaignForm').addEventListener('submit',async e=>{
 e.preventDefault();if(campaignSaving||campaignLoading)return;const c=campaignValues(),status=el('campaignAdminStatus');
 if(c.enabled&&[c.title,c.body,c.terms,c.cta_label].some(x=>!x)){status.textContent='表示する場合は、見出し・内容・適用条件・ボタン文言を入力してください。';return;}
 if(c.ends_on&&(!/^\d{4}-\d{2}-\d{2}$/.test(c.ends_on)||!Number.isFinite(Date.parse(c.ends_on)))){status.textContent='受付期限の日付をご確認ください。';return;}
 campaignSaving=true;el('saveCampaign').disabled=true;status.textContent='保存しています…';
 try{await api({api:'admin_save_campaign',campaign:c});status.textContent=c.enabled?'保存しました。案件マップを開き直すと案内が表示されます。期限が過ぎている場合は表示しません。':'保存しました。キャンペーンの案内を非表示にしました。';}
 catch(e){status.textContent=e.message||'保存できませんでした。';}finally{campaignSaving=false;el('saveCampaign').disabled=false;}
});
el('copyCommonURL').addEventListener('click',async()=>{try{const u=new URL(el('companyBaseURL').value.trim());if(u.origin!=='https://kame0483.github.io'||!/^\/madoguchi-lead-map\/(index\.html)?$/.test(u.pathname))throw Error('共有先URLをご確認ください。');u.searchParams.delete('company');await navigator.clipboard.writeText(u.href);el('baseURLStatus').textContent='共通URLをコピーしました。会社の識別は匿名になります。';}catch(e){el('baseURLStatus').textContent=e.message||'コピーできませんでした。';}});
el('crmSearchForm').addEventListener('submit',async e=>{
 e.preventDefault();const query=el('crmQuery').value.trim(),field=el('crmSearchField').value,status=el('crmSearchStatus');
 if(query.length<2){status.textContent='会社名などを2文字以上で入力してください。';return;}if(field==='phone'&&!/^0[0-9]{9,10}$/.test(query.normalize('NFKC').replace(/[\s()-]/g,'').replace(/^\+81/,'0'))){status.textContent='電話番号は市外局番から10〜11桁で入力してください。';return;}el('crmSearchButton').disabled=true;status.textContent='MFから検索しています…';
 try{const r=await api({api:'admin_crm_search',query,field});crmSearchRows=r.rows||[];el('crmSearchResults').innerHTML=crmSearchRows.map((r,i)=>'<article class="crm-company"><h4>'+esc(r.company_name)+'</h4><p>'+esc([r.public_id,r.prefecture,r.city].filter(Boolean).join(' ／ '))+'</p><p>'+esc([r.phone||r.mobile,r.email].filter(Boolean).join(' ／ '))+'</p><button type="button" data-crm-index="'+i+'">この会社のURLを発行する →</button></article>').join('');status.textContent=crmSearchRows.length?crmSearchRows.length+'社を表示しました。拠点・電話番号を確認して選んでください。'+(crmSearchRows.length>=20?' 最大20社までの表示です。絞り込んで検索できます。':''):'見つかりませんでした。会社名の一部・電話番号・MFの会社番号でお試しください。';}
 catch(e){status.textContent=e.message||'検索できませんでした。';}finally{el('crmSearchButton').disabled=false;}
});
el('crmSearchResults').addEventListener('click',async e=>{
 const b=e.target.closest('[data-crm-index]');if(!b||issuerBusy)return;const row=crmSearchRows[Number(b.dataset.crmIndex)];if(!row)return;
 try{requireBaseURL();}catch(e){issuerStatus(e.message,true);el('companyBaseURL').focus();return;}
 issuerLoading(true);b.disabled=true;
 try{const r=await api({api:'admin_crm_link',company_id:row.id});receiveCompanies(r.rows);issuerStatus(row.company_name+'のMF情報とひも付くURLを発行しました。拠点の都道府県から表示します。');el('companyResults').scrollIntoView({behavior:'auto',block:'start'});}
 catch(e){issuerStatus(e.message||'発行できませんでした。',true);}finally{b.disabled=false;issuerLoading(false);}
});
