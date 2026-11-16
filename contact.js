"use strict";
const contactDialog=document.getElementById("contactDialog");
let contactRequestedArea="",contactAction="conditions",contactCaseId=null,contactOpener=null,contactOpenVersion=0,contactSubmitting=false,contactSubmissionId=null,contactSubmissionBody=null;
const contactEl=id=>document.getElementById(id);
const contactIntents={
 respond:{label:"この案件への対応希望",heading:"ありがとうございます！",intro:"弊社の担当者からお電話いたします。御社の連絡先と、ご都合のよい日時をお知らせください。",submit:"この案件の対応について連絡を依頼する",success:"ご希望を受け付けました",next:"担当者からご入力のお電話番号へご連絡し、案件の紹介可否や条件をご案内します。"},
 conditions:{label:"案件・紹介条件のご相談",heading:"気になることから、ご相談ください。",intro:"紹介条件や対応エリアについて、担当者が個別にご案内します。御社の連絡先をお知らせください。",submit:"条件について相談する",success:"ご相談を受け付けました",next:"担当者からご入力のお電話番号へご連絡し、ご希望のエリアや紹介条件をお伺いします。"},
 materials:{label:"サービス資料のご請求",heading:"まずは資料で、ご確認ください。",intro:"案件紹介の仕組みや料金体系をご検討いただくための資料を、担当者からメールでご案内します。",submit:"サービス資料を請求する",success:"資料請求を受け付けました",next:"担当者から、ご入力のメールアドレスへ資料をご案内します。内容の確認のため、お電話する場合があります。"},
 trial:{label:"無料トライアルのご相談",heading:"御社で試せるか、ご相談ください。",intro:"御社のエリアやご希望を伺い、トライアルの対象・期間・費用の適用範囲をご案内します。送信だけで利用開始は確定しません。",submit:"無料トライアルについて相談する",success:"トライアルのご相談を受け付けました",next:"担当者からご入力のお電話番号へご連絡し、対象エリアや実施条件をご案内します。"}
};
const CONTACT_FORM_ENDPOINT="https://formsubmit.co/ajax/t.kamei@madoguchi.inc";
function contactNotification(data){
 const c=data.case_id?contactCases.get(data.case_id):null;
 const subject="【資料ダウンロード】"+contactIntents[data.action].label+" / "+data.company_name;
 return {_subject:subject,_template:"table",email:data.email,
 "受付番号":data.request_id,"ご用件":contactIntents[data.action].label,"会社名":data.company_name,"担当者名":data.contact_name,"電話番号":data.phone,"メールアドレス":data.email,
 "電話可能日":data.preferred_window==="now"?"今すぐの連絡を希望":data.preferred_date||"指定なし","電話可能時間帯":data.preferred_window==="now"?"今すぐ":data.preferred_window==="any"?"指定なし":data.preferred_window,"案件ID":c?.case_id||"案件全般","案件種別":c?serviceLabel(c.service_code):"全般","希望エリア":data.requested_area||[c?.pref,c?.city].filter(Boolean).join(" ")||"指定なし"};
}
async function contactRequest(data){
 const registered=await call({api:"conversion_submit",...data,visit_id:window.LeadMapActivity?.id||null});
 if(registered.email_acknowledged)return {request_id:data.request_id};
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
 try{
  const response=await fetch(CONTACT_FORM_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(contactNotification(data)),signal:ctrl.signal,cache:"no-store",referrerPolicy:"origin",credentials:"omit"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("送信を完了できませんでした。下のメール窓口、または予約ページからご連絡ください。");
  if(/activat|confirm.*email/i.test(String(result.message||"")))throw new Error("メール通知の初回認証が完了していません。お急ぎの場合は下のメール窓口、または予約ページをご利用ください。");
  if(result.success!==true&&result.success!=="true"){
   throw new Error("受付結果を確認できませんでした。下のメール窓口、または予約ページをご利用ください。");
  }
  try{await call({api:"conversion_email_ack",request_id:data.request_id})}catch{}
  return {request_id:data.request_id};
 }catch(e){if(e.name==="AbortError")throw new Error("送信結果を確認できませんでした。再送すると重複する場合があります。お急ぎの場合は下の予約ページをご利用ください。");if(e.name==="TypeError")throw new Error("通信を完了できませんでした。接続状況を確認するか、下のメール窓口・予約ページをご利用ください。");throw e;}finally{clearTimeout(timer)}
}
function contactToday(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10)}
function contactSetBusy(busy){contactSubmitting=busy;contactEl("contactSubmit").disabled=busy;contactEl("contactSubmit").textContent=busy?"送信しています…":contactIntents[contactAction].submit;contactEl("contactClose").disabled=busy;contactEl("contactForm").querySelectorAll("input,select,button").forEach(el=>el.disabled=busy||(!busy&&el.id==="contactDate"&&contactEl("contactForm").querySelector('input[name="callback_time"]:checked')?.value==="now"));}
async function openContactDialog(action,caseId,opener){
 if(contactSubmitting)return;
 const version=++contactOpenVersion;contactAction=Object.hasOwn(contactIntents,action)?action:"conditions";contactCaseId=caseId||null;contactOpener=opener;contactSubmissionId=null;contactSubmissionBody=null;
 const c=contactCaseId?contactCases.get(contactCaseId):null;contactRequestedArea=typeof view!=="undefined"&&view.label!=="全国"?view.label:"";
 const intent=contactIntents[contactAction];
 contactEl("contactIntent").textContent=intent.label;
 contactEl("contactHeading").textContent=intent.heading;
 contactEl("contactIntro").querySelector(".dialog-intro").textContent=intent.intro;
 contactEl("contactSubmit").textContent=intent.submit;
 contactEl("contactCase").textContent=c?[serviceLabel(c.service_code),c.pref,c.city].filter(Boolean).join(" ／ ")+"\n案件ID："+c.case_id:contactRequestedArea+ (contactRequestedArea?"の紹介条件について":"案件・対応エリア全般について");
 contactEl("contactIntro").querySelector(".dialog-intro").hidden=false;contactEl("contactIntro").hidden=false;contactEl("contactSuccess").hidden=true;contactEl("contactForm").hidden=true;contactEl("contactUnavailable").hidden=true;contactEl("contactLoading").hidden=false;contactEl("contactError").hidden=true;
 contactEl("contactDate").min=contactToday();contactEl("contactDate").max=new Date(Date.now()+90*86400000+9*3600000).toISOString().slice(0,10);
 const fallback=c?responseMail(c,contactAction==="respond"?"対応":"相談"):"mailto:"+CONTACT_EMAIL+"?subject="+encodeURIComponent("【案件エリアマップ】"+intent.label)+"&body="+encodeURIComponent("会社名：\n担当者名：\n電話番号：\nメールアドレス：\nご用件："+intent.label);
 contactEl("contactFallbackMail").href=fallback;
 if(!contactDialog.open){if(typeof contactDialog.showModal==="function")contactDialog.showModal();else contactDialog.setAttribute("open","");}
 contactDialog.scrollTop=0;
 contactEl("contactLoading").hidden=true;
 contactEl("contactForm").hidden=false;
 contactEl("contactDate").disabled=contactEl("contactForm").querySelector('input[name="callback_time"]:checked')?.value==="now";
 contactEl("contactCompany").focus({preventScroll:true});
}
function closeContactDialog(){if(contactSubmitting)return;contactOpenVersion++;if(typeof contactDialog.close==="function")contactDialog.close();else contactDialog.removeAttribute("open");contactOpener?.focus({preventScroll:true});}
function contactShowError(message){
 const error=contactEl("contactError");error.textContent=message;error.hidden=false;
 error.scrollIntoView({behavior:"auto",block:"center"});error.focus({preventScroll:true});
}
function contactShowResult(result,payload){
 window.LeadMapActivity?.track("conversion",{action:payload.action,case_id:payload.case_id||""});
 const summary={request_id:result.request_id,action:payload.action,preferred_date:payload.preferred_date,preferred_window:payload.preferred_window};
 try{sessionStorage.setItem("lead-map-confirmation",JSON.stringify(summary));}catch{}
 const hash=new URLSearchParams({receipt:result.request_id,intent:payload.action});
 location.assign("thanks.html#"+hash.toString());
}
async function handleContactSubmit(e){
 e?.preventDefault();if(contactSubmitting)return;
 try{
  const form=contactEl("contactForm");
  for(const id of ["contactCompany","contactName","contactPhone","contactEmail"])contactEl(id).value=contactEl(id).value.trim();
  if(!form.checkValidity()){
   const invalid=[...form.querySelectorAll("input,select")].filter(el=>el.willValidate&&!el.validity.valid);
   const labels={company_name:"会社名",contact_name:"担当者名",phone:"電話番号",email:"メールアドレス",preferred_date:"希望日"};
   contactShowError(invalid.map(el=>labels[el.name]||"入力項目").join("・")+"をご確認ください。必須項目と入力形式を確認してから送信してください。");
   invalid.forEach(el=>el.setAttribute("aria-invalid","true"));return;
  }
  const payload={action:contactAction,case_id:contactCaseId,company_name:contactEl("contactCompany").value,contact_name:contactEl("contactName").value,phone:contactEl("contactPhone").value.normalize("NFKC").replace(/[\s()（）ー－-]/g,""),email:contactEl("contactEmail").value.toLowerCase(),preferred_date:contactEl("contactDate").value||null,preferred_window:form.querySelector('input[name="callback_time"]:checked')?.value||"any"};
  if(contactRequestedArea)payload.requested_area=contactRequestedArea;
  if(payload.phone.startsWith("+81"))payload.phone="0"+payload.phone.slice(3);
  if(!/^0[1-9][0-9]{8,9}$/.test(payload.phone)){contactShowError("電話番号は10桁または11桁で入力してください。ハイフン付きでも入力できます。");contactEl("contactPhone").setAttribute("aria-invalid","true");return;}
  if(payload.preferred_window==="now")payload.preferred_date=null;
  const body=JSON.stringify(payload);if(body!==contactSubmissionBody){contactSubmissionId=crypto.randomUUID();contactSubmissionBody=body;}
  contactEl("contactError").hidden=true;contactEl("contactUnavailable").hidden=true;contactSetBusy(true);
  const result=await contactRequest({request_id:contactSubmissionId,...payload});contactShowResult(result,payload);
 }catch(error){contactShowError(error.message||"送信を完了できませんでした。下のメール窓口、または予約ページをご利用ください。");contactEl("contactUnavailable").hidden=false;}
 finally{contactSetBusy(false)}
}
document.addEventListener("click",e=>{const trigger=e.target.closest?.("[data-contact-action]");if(!trigger)return;e.preventDefault();contactEl("contactIntro").querySelector(".dialog-intro").hidden=false;openContactDialog(trigger.dataset.contactAction,trigger.dataset.contactId,trigger).catch(()=>{});});
contactEl("contactClose").addEventListener("click",closeContactDialog);
contactDialog.addEventListener("cancel",e=>{e.preventDefault();closeContactDialog()});
contactEl("contactForm").addEventListener("submit",handleContactSubmit);
contactEl("contactPhone").addEventListener("input",()=>contactEl("contactPhone").setCustomValidity(""));
document.addEventListener("input",e=>{if(e.target?.matches?.("#contactForm input"))e.target.removeAttribute("aria-invalid")});

document.addEventListener("change",e=>{if(e.target?.name!=="callback_time")return;const now=e.target.value==="now";contactEl("contactDate").disabled=now;if(now)contactEl("contactDate").value="";});
