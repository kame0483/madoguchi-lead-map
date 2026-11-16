import { normalizeContact } from './contact.ts';
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions=['respond','conditions','materials','trial'];
const buttonActions=['respond','conditions','materials','trial','search','load_more','refresh','filter_add','filter_clear','filter_remove','calendar','list_jump','prefecture','national','city','other_details','submit','close_form'];
export function normalizeActivity(b:any){
 if(!uuid.test(b.visit_id)||!['mobile','desktop'].includes(b.device)||typeof b.company_code!=='string'||!/^[A-Za-z0-9_-]{0,64}$/.test(b.company_code)||!Array.isArray(b.events)||b.events.length<1||b.events.length>20)throw Error('invalid_activity');
 const events=b.events.map((e:any)=>{
  if(!e||!uuid.test(e.event_id)||!['page_view','heartbeat','button_click','area_search','filter_apply','conversion'].includes(e.kind)||!['map','thanks'].includes(e.page)||!Number.isInteger(e.active_ms)||e.active_ms<0||e.active_ms>86400000)throw Error('invalid_activity');
  const clean=(k:string,n:number)=>{const v=e[k]??'';if(typeof v!=='string'||v.length>n||/[\u0000-\u001f]/.test(v))throw Error('invalid_activity');return v;};
  const action=clean('action',80);if(action&&!buttonActions.includes(action)&&!actions.includes(action))throw Error('invalid_activity');
  // No free text, URLs, contact fields, search input, IP or user agent are stored.
  return {event_id:e.event_id,kind:e.kind,page:e.page,active_ms:e.active_ms,action,case_id:clean('case_id',100),area:clean('area',100),field:clean('field',160)};
 });
 return {p_visit_id:b.visit_id,p_device:b.device,p_company_code:b.company_code,p_events:events};
}
const labels:Record<string,string>={respond:'この案件への対応希望',conditions:'案件・紹介条件のご相談',materials:'サービス資料のご請求',trial:'無料トライアルのご相談'};
const safe=(v:unknown)=>String(v??'').replace(/[<>&*`]/g,' ').slice(0,300);
export function chatMessage(r:any){
 const c=r.case_snapshot||{};
 return ['【資料ダウンロード／案件エリアマップ】',labels[r.action]||'お問い合わせ','会社名：'+safe(r.company_name),'担当者名：'+safe(r.contact_name),'電話番号：'+safe(r.phone),'メール：'+safe(r.email),'電話希望：'+(r.preferred_window==='now'?'今すぐの連絡を希望':safe(r.preferred_date||'日付指定なし')+' ／ '+safe(r.preferred_window==='any'?'時間指定なし':r.preferred_window)),'案件ID：'+safe(r.case_id||'案件全般'),'種別・エリア：'+safe(c.service_code==='amamori'?'雨漏り':c.service_code==='gaiheki'?'外壁':'全般')+' '+safe(c.requested_area||[c.pref,c.city].filter(Boolean).join(' ')),'質問・ご要望：'+safe(c.inquiry_note||'記入なし'),'受付番号：'+r.request_id,'※希望日時は確定予約ではありません。'].join('\n');
}
export async function postChat(webhook:string,text:string){
 if(!webhook)return {state:'failed',error:'chat_not_configured'};
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),8000);
 try{
  const r=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:ctrl.signal});
  if(!r.ok)return {state:'failed',error:'chat_http_'+r.status};
  const j=await r.json().catch(()=>({}));return {state:'sent',message_name:j.name||''};
 }catch{return {state:'unknown',error:'chat_delivery_unconfirmed'};}finally{clearTimeout(timer)}
}
export async function deliverChat(sb:any,id:string,webhook:string){
 const {data:row,error}=await sb.rpc('lead_map_claim_chat_v1',{p_request_id:id});
 if(error)return 'failed';if(!row)return null;
 const r=await postChat(webhook,chatMessage(row));
 const saved=await sb.from('lead_map_contact_requests').update({chat_state:r.state,chat_error:r.error||null,chat_sent_at:r.state==='sent'?new Date().toISOString():null}).eq('request_id',id).eq('chat_state','sending');
 if(saved.error)console.error('chat_status_unconfirmed');
 return r.state;
}
export async function registerConversion(req:Request,b:any,sb:any,accessHash:string,hash:(x:string)=>Promise<string>,webhook:string){
 let input;try{input=normalizeContact(b);if(b.visit_id!=null&&!uuid.test(b.visit_id))throw Error();}catch{return {status:400,body:{error:'invalid_contact'}};}
 const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'';
 const {request_id,...payload}=input;
 const {data:row,error}=await sb.rpc('lead_map_register_contact_v1',{p_request_id:request_id,p_access_hash:accessHash,p_payload_hash:await hash(JSON.stringify(payload)),p_ip_hash:ip?await hash(accessHash+'|'+ip):null,p_action:input.action,p_case_id:input.case_id,p_company_name:input.company_name,p_contact_name:input.contact_name,p_email:input.email,p_phone:input.phone,p_preferred_date:input.preferred_date,p_preferred_window:input.preferred_window});
 if(error){const m=String(error.message||'');return {status:m.includes('rate_limited')?429:400,body:{error:m.includes('case_unavailable')?'case_unavailable':m.includes('idempotency_conflict')?'idempotency_conflict':'invalid_contact'}};}
 if(b.visit_id&&!row.visit_id)await sb.from('lead_map_contact_requests').update({visit_id:b.visit_id}).eq('request_id',request_id).is('visit_id',null);
 if(input.message||input.requested_area){const saved=await sb.from('lead_map_contact_requests').update({case_snapshot:{...(row.case_snapshot||{}),...(!input.case_id&&input.requested_area?{requested_area:input.requested_area}:{}),...(input.message?{inquiry_note:input.message}:{})}}).eq('request_id',request_id);if(saved.error)return {status:500,body:{error:'area_save_failed'}};}

 const state=await deliverChat(sb,request_id,webhook);
 return {status:200,body:{ok:true,request_id,chat_status:state||row.chat_state,email_acknowledged:!!row.email_ack_at}};
}

export function normalizeCompanyRef(value:string){
 const ref=value.normalize('NFKC').trim(),digits=ref.replace(/[\s()-]/g,'').replace(/^\+81/,'0');
 return /^[+\d\s()-]+$/.test(ref)&&/^0[1-9][0-9]{8,9}$/.test(digits)?digits:ref;
}
export function normalizeCompanies(b:any){
 if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>500)throw Error('invalid_companies');
 return b.rows.map((r:any,i:number)=>{
  const name=typeof r?.company_name==='string'?r.company_name.trim():'',email=typeof r?.recipient_email==='string'?r.recipient_email.trim().toLowerCase():'',ref=typeof r?.external_ref==='string'?normalizeCompanyRef(r.external_ref):'';
  if(!name||name.length>120||/[\u0000-\u001f]/.test(name)||email.length>254||(email&&!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email))||ref.length>120||/[\u0000-\u001f]/.test(ref)||(!email&&!ref))throw Error('invalid_row_'+(i+1));
  return {company_name:name,recipient_email:email,external_ref:ref};
 });
}
