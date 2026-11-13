"use strict";
const contactDialog=document.getElementById("contactDialog");
let contactAction="conditions",contactCaseId=null,contactOpener=null,contactOpenVersion=0,contactSubmitting=false,contactSubmissionId=null,contactSubmissionBody=null;
const contactEl=id=>document.getElementById(id);
const contactMessages={email_not_configured:"電話受付はただいま準備中です。下の予約ページ、またはメールからお問い合わせください。",case_unavailable:"この案件の状況が更新されています。Web予約またはメールから、案件の紹介可否をお問い合わせください。",rate_limited:"短時間で複数のお申し込みがありました。少し時間をおくか、下の予約ページからご相談ください。",invalid_contact:"会社名・メールアドレス・電話番号・希望日をご確認ください。",idempotency_conflict:"入力内容が変更されています。一度画面を閉じて、もう一度お申し込みください。"};
async function contactRequest(data){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
 try{
  const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","x-lead-map-key":TOKEN},body:JSON.stringify(data),signal:ctrl.signal,cache:"no-store",referrerPolicy:"no-referrer"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(contactMessages[result.error]||(response.status===403?"担当者から届いた閲覧URLを開いて、もう一度お試しください。":"送信を完了できませんでした。少し時間をおいて再度お試しください。"));
  if(!result.ok||!result.request_id)throw new Error("受付結果を確認できませんでした。再度送信してください。");
  return result;
 }catch(e){if(e.name==="AbortError")throw new Error("通信の完了を確認できませんでした。入力内容を変えずに再度送信すると、重複を避けて確認できます。");throw e;}finally{clearTimeout(timer)}
}
function contactToday(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10)}
function contactSetBusy(busy){contactSubmitting=busy;contactEl("contactSubmit").disabled=busy;contactEl("contactSubmit").textContent=busy?"送信しています…":"この内容で電話連絡を依頼する";contactEl("contactRetryMail").disabled=busy;contactEl("contactClose").disabled=busy;contactEl("contactForm").querySelectorAll("input,select").forEach(el=>el.disabled=busy);}
async function openContactDialog(action,caseId,opener){
 if(contactSubmitting)return;
 const version=++contactOpenVersion;contactAction=action==="respond"?"respond":"conditions";contactCaseId=caseId||null;contactOpener=opener;contactSubmissionId=null;contactSubmissionBody=null;
 const c=contactCaseId?contactCases.get(contactCaseId):null;
 contactEl("contactIntent").textContent=contactAction==="respond"?"この案件への対応希望":"条件についてのご相談";
 contactEl("contactHeading").textContent="ありがとうございます！";
 contactEl("contactCase").textContent=c?[serviceLabel(c.service_code),c.pref,c.city].filter(Boolean).join(" ／ ")+"\n案件ID："+c.case_id:"案件・対応エリア全般について";
 contactEl("contactIntro").querySelector(".dialog-intro").hidden=false;contactEl("contactIntro").hidden=false;contactEl("contactSuccess").hidden=true;contactEl("contactForm").hidden=true;contactEl("contactUnavailable").hidden=true;contactEl("contactLoading").hidden=false;contactEl("contactError").hidden=true;
 contactEl("contactDate").min=contactToday();contactEl("contactDate").max=new Date(Date.now()+90*86400000+9*3600000).toISOString().slice(0,10);
 const fallback=c?responseMail(c,contactAction==="respond"?"対応":"相談"):"mailto:"+CONTACT_EMAIL+"?subject="+encodeURIComponent("【案件エリアマップ】条件についての相談");
 contactEl("contactFallbackMail").href=fallback;
 if(!contactDialog.open){if(typeof contactDialog.showModal==="function")contactDialog.showModal();else contactDialog.setAttribute("open","");}
 contactDialog.scrollTop=0;
 try{
  const r=await fetch(API+"?api=contact_config",{cache:"no-store",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error("unavailable");const config=await r.json();
  if(version!==contactOpenVersion||!contactDialog.open)return;
  contactEl("contactLoading").hidden=true;
  if(config.intake_ready===true&&config.email_enabled&&TOKEN){contactEl("contactForm").hidden=false;contactEl("contactCompany").focus({preventScroll:true});}
  else{contactEl("contactIntro").querySelector(".dialog-intro").hidden=true;contactEl("contactUnavailable").hidden=false;}
 }catch{
  if(version!==contactOpenVersion||!contactDialog.open)return;
  contactEl("contactLoading").hidden=true;contactEl("contactIntro").querySelector(".dialog-intro").hidden=true;contactEl("contactUnavailable").hidden=false;
 }
}
function closeContactDialog(){if(contactSubmitting)return;contactOpenVersion++;if(typeof contactDialog.close==="function")contactDialog.close();else contactDialog.removeAttribute("open");contactOpener?.focus({preventScroll:true});}
function contactShowResult(result,payload){
 contactEl("contactForm").hidden=true;contactEl("contactIntro").hidden=true;contactEl("contactSuccess").hidden=false;
 contactEl("contactRequestNumber").textContent=result.request_id;contactEl("contactSavedPhone").textContent=payload.phone;
 contactEl("contactSavedTime").textContent=(payload.preferred_date||"日程の指定なし")+" ／ "+(payload.preferred_window==="any"?"時間帯の指定なし":payload.preferred_window.replace("-","〜"));
 const confirmed=result.notification_status==="sent",receipt=result.receipt_status==="sent";
 contactEl("contactReceiptNote").textContent=confirmed?(receipt?"受付内容を、ご入力のメールアドレスへお送りしました。":"受付は完了しています。確認メールの送信を確認できないため、お急ぎの場合は下の予約ページをご利用ください。 一度届いたメールがないかもご確認ください。") :"ご依頼は記録されましたが、担当者への通知の完了を確認できません。再確認をお試しいただくか、お急ぎの場合は下の予約ページをご利用ください。";
 contactEl("contactRetryMail").hidden=result.notification_status==="unknown"||result.receipt_status==="unknown"||(confirmed&&receipt);
 contactEl("contactSuccess").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
}
async function contactSubmit(e){
 e?.preventDefault();if(contactSubmitting)return;
 const form=contactEl("contactForm");if(!form.reportValidity())return;
 const payload={action:contactAction,case_id:contactCaseId,company_name:contactEl("contactCompany").value.trim(),contact_name:contactEl("contactName").value.trim(),phone:contactEl("contactPhone").value.normalize("NFKC").replace(/[\s()（）ー－-]/g,""),email:contactEl("contactEmail").value.trim().toLowerCase(),preferred_date:contactEl("contactDate").value||null,preferred_window:contactEl("contactWindow").value,fax_address:contactEl("contactFax").value};
 if(payload.phone.startsWith("+81"))payload.phone="0"+payload.phone.slice(3);
 if(!/^0[1-9][0-9]{8,9}$/.test(payload.phone)){contactEl("contactPhone").setCustomValidity("10桁または11桁の電話番号を入力してください。");contactEl("contactPhone").reportValidity();return;}
 const body=JSON.stringify(payload);if(body!==contactSubmissionBody){contactSubmissionId=crypto.randomUUID();contactSubmissionBody=body;}
 contactEl("contactError").hidden=true;contactSetBusy(true);
 try{const result=await contactRequest({api:"contact_submit",request_id:contactSubmissionId,...payload});contactShowResult(result,payload);}
 catch(error){contactEl("contactError").textContent=error.message;contactEl("contactError").hidden=false;}
 finally{contactSetBusy(false)}
}
document.addEventListener("click",e=>{const trigger=e.target.closest?.("[data-contact-action]");if(!trigger)return;e.preventDefault();contactEl("contactIntro").querySelector(".dialog-intro").hidden=false;openContactDialog(trigger.dataset.contactAction,trigger.dataset.contactId,trigger).catch(()=>{});});
contactEl("contactClose").addEventListener("click",closeContactDialog);
contactDialog.addEventListener("cancel",e=>{e.preventDefault();closeContactDialog()});
contactEl("contactForm").addEventListener("submit",contactSubmit);
contactEl("contactPhone").addEventListener("input",()=>contactEl("contactPhone").setCustomValidity(""));
contactEl("contactRetryMail").addEventListener("click",()=>contactSubmit());
