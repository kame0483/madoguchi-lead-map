export const CONTACT_EMAIL = "info@gaihekiplus.com";
export const CONTACT_CALENDAR = "https://calendar.app.google/mRRBUfa9pHoPJVxeA";
const emailPattern=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
export function contactConfig(){return {email_enabled:Boolean(Deno.env.get("SENDGRID_API_KEY")),intake_ready:true,calendar_url:CONTACT_CALENDAR};}
export function normalizeContact(body:Record<string,unknown>){
 const txt=(k:string,max:number,required=false)=>{const value=typeof body[k]==="string"?String(body[k]).trim():"";if((required&&!value)||value.length>max||/[\r\n\u0000-\u001f]/.test(value))throw new Error("invalid_contact");return value;};
 const company=txt("company_name",120,true),name=txt("contact_name",80),email=txt("email",254,true).toLowerCase();
 let phone=txt("phone",30,true).normalize("NFKC").replace(/[\s()（）ー－-]/g,"");if(phone.startsWith("+81"))phone="0"+phone.slice(3);
 if(!emailPattern.test(email)||!/^0[1-9][0-9]{8,9}$/.test(phone))throw new Error("invalid_contact");
 const action=txt("action",20,true),caseId=txt("case_id",100)||null,requestId=txt("request_id",36,true);
 if(!["respond","conditions"].includes(action)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))throw new Error("invalid_contact");
 if(txt("fax_address",100))throw new Error("invalid_contact");
 const date=txt("preferred_date",10)||null,window=txt("preferred_window",20)||"any";
 if(!["any","09:00-12:00","12:00-15:00","15:00-18:00"].includes(window))throw new Error("invalid_contact");
 if(date){
  const d=new Date(date+"T00:00:00+09:00"),today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||new Date(d.getTime()+9*3600000).toISOString().slice(0,10)!==date||date<today||d.getTime()>Date.now()+91*86400000)throw new Error("invalid_contact");
 }
 return {request_id:requestId,action,case_id:caseId,company_name:company,contact_name:name,email,phone,preferred_date:date,preferred_window:window};
}
export function contactMail(kind:string,row:any){
 const c=row.case_snapshot||{},label=row.action==="respond"?"案件対応のご希望":"条件についてのご相談";
 const area=[c.pref,c.city].filter(Boolean).join(" ")||"案件・対応エリア全般";
 const service=c.service_code==="amamori"?"雨漏り":c.service_code==="gaiheki"?"外壁":"全般";
 const when=(row.preferred_date||"日程の指定なし")+" ／ "+(row.preferred_window==="any"?"時間帯の指定なし":row.preferred_window);
 const summary=["受付番号："+row.request_id,"ご用件："+label,"会社名："+row.company_name,"ご担当者："+(row.contact_name||"未入力"),"電話番号："+row.phone,"メールアドレス："+row.email,"電話可能な日時（日本時間）："+when,"案件ID："+(row.case_id||"案件全般"),"種別："+service,"エリア："+area];
 if(kind==="admin")return {to:CONTACT_EMAIL,replyTo:row.email,subject:"【案件エリアマップ】"+label+" / "+row.company_name,text:summary.concat(["住所："+(c.address||"—"),"案件受付日時："+(c.inquired_at||c.effective_at||"—"),"","ご希望日時は確定予約ではありません。担当者からお電話をお願いいたします。","Web予約状況は予約カレンダーをご確認ください。",CONTACT_CALENDAR]).join("\n")};
 return {to:row.email,replyTo:CONTACT_EMAIL,subject:"【madoguchi】お問い合わせを受け付けました",text:[row.company_name+(row.contact_name?"\n"+row.contact_name+"様":" ご担当者様"),"","案件エリアマップからご連絡いただき、ありがとうございます。",label+"を受け付けました。","","弊社の担当者から、ご入力いただいた電話番号へお電話いたします。","ご希望日時は確定予約ではありません。担当者が確認のうえご連絡いたします。","",...summary,"","【資料を共有しながらのWeb打ち合わせをご希望の方】","以下の予約ページから、ご都合のよい日時をお選びください。",CONTACT_CALENDAR,"","本メールにお心当たりがない場合は、このメールにご返信ください。","madoguchi株式会社",CONTACT_EMAIL].join("\n")};
}
async function sendMail(message:any,requestId:string,kind:string){
 const from=(Deno.env.get("LEAD_MAP_MAIL_FROM")||CONTACT_EMAIL).trim();
 if(!emailPattern.test(from))return {state:"failed",error:"invalid_sender"};
 const sg=Deno.env.get("SENDGRID_API_KEY");
 if(!sg)return {state:"failed",error:"email_not_configured"};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch("https://api.sendgrid.com/v3/mail/send",{
   method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",Authorization:"Bearer "+sg},
   body:JSON.stringify({personalizations:[{to:[{email:message.to}]}],from:{email:from,name:"madoguchi株式会社"},reply_to:{email:message.replyTo},subject:message.subject,content:[{type:"text/plain",value:message.text}],custom_args:{source:"lead_map_contact",request_id:requestId,mail_kind:kind}})
  });
  if(!response.ok)return {state:"failed",error:"provider_"+response.status};
  return {state:"sent",provider_id:response.headers.get("x-message-id")||""};
 }catch{return {state:"unknown",error:"delivery_unconfirmed"};}finally{clearTimeout(timer)}
}

async function processMail(sb:any,requestId:string,kind:string){
 const {data:row,error}=await sb.rpc("lead_map_claim_contact_mail_v1",{p_request_id:requestId,p_kind:kind});
 if(error||!row)return;
 const result=await sendMail(contactMail(kind,row),requestId,kind);
 const update:any={};update[kind+"_state"]=result.state;update[kind+"_error"]=result.error||null;update[kind+"_provider_id"]=result.provider_id||null;
 const saved=await sb.from("lead_map_contact_requests").update(update).eq("request_id",requestId).eq(kind+"_state","sending");
 if(saved.error)console.error("contact mail status persistence",kind);
}
export async function submitContact(req:Request,body:Record<string,unknown>,sb:any,accessHash:string,hash:(s:string)=>Promise<string>){
 if(req.method!=="POST")return {status:405,body:{error:"method_not_allowed"}};
 if(!contactConfig().email_enabled)return {status:503,body:{error:"email_not_configured"}};
 let input;try{input=normalizeContact(body)}catch{return {status:400,body:{error:"invalid_contact"}};}
 const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"";
 const {request_id,...payload}=input;
 const {error}=await sb.rpc("lead_map_register_contact_v1",{
  p_request_id:request_id,p_access_hash:accessHash,p_payload_hash:await hash(JSON.stringify(payload)),p_ip_hash:ip?await hash(accessHash+"|"+ip):null,
  p_action:input.action,p_case_id:input.case_id,p_company_name:input.company_name,p_contact_name:input.contact_name,p_email:input.email,p_phone:input.phone,p_preferred_date:input.preferred_date,p_preferred_window:input.preferred_window
 });
 if(error){const code=String(error.message||"");return {status:code.includes("rate_limited")?429:400,body:{error:code.includes("case_unavailable")?"case_unavailable":code.includes("rate_limited")?"rate_limited":code.includes("idempotency_conflict")?"idempotency_conflict":"invalid_contact"}};}
 await processMail(sb,request_id,"admin");
 await processMail(sb,request_id,"receipt");
 const {data:saved,error:lookupError}=await sb.from("lead_map_contact_requests").select("admin_state,receipt_state").eq("request_id",request_id).single();
 if(lookupError||!saved)return {status:202,body:{ok:true,request_id,notification_status:"unconfirmed",receipt_status:"unconfirmed",calendar_url:CONTACT_CALENDAR}};
 return {status:200,body:{ok:true,request_id,notification_status:saved.admin_state,receipt_status:saved.receipt_state,calendar_url:CONTACT_CALENDAR}};
}
