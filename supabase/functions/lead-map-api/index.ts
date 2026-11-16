import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { ACCESS_HASH } from "./access-config.ts";
import { contactConfig, submitContact } from "./contact.ts";
import { ADMIN_HASH, CHAT_WEBHOOK } from "./notification-config.ts";
import { normalizeActivity, registerConversion, deliverChat, postChat, uuid, normalizeCompanies } from "./activity.ts";
import { publicPage, publicBootstrap, normalizeCampaign, publicFilterOptions, isPublicFilterValue } from "./sharing.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-lead-map-key,x-lead-map-admin","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
async function sha256Hex(input:string){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input));return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function out(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!["GET","POST"].includes(req.method))return out({error:"method_not_allowed"},405);
 try{
  const url=new URL(req.url);
  if(req.method==="GET"&&url.searchParams.get("api")==="contact_config")return out(contactConfig());
  const text=req.method==="POST"?await req.text():"{}";
  if(text.length>160000)return out({error:"request_too_large"},413);
  let body:Record<string,unknown>;try{body=JSON.parse(text)}catch{return out({error:"invalid_json"},400)}
  if(!body||Array.isArray(body)||typeof body!=="object")return out({error:"invalid_request"},400);
  const get=(k:string)=>body[k]??url.searchParams.get(k);
  const api=String(get("api")||"summary"),adminRoute=api.startsWith("admin_");
  const token=adminRoute?req.headers.get("x-lead-map-admin")||"":req.headers.get("x-lead-map-key")||url.searchParams.get("k")||"";
  const publicRoutes=['bootstrap','summary','metrics','cases','case_filters','site_config','activity','conversion_submit','conversion_email_ack'];
  const publicView=!adminRoute&&!token&&publicRoutes.includes(api);
  if(!publicView&&(!token||await sha256Hex(token)!==(adminRoute?ADMIN_HASH:ACCESS_HASH)))return out({error:"forbidden"},403);
  if((adminRoute||["activity","conversion_submit","conversion_email_ack"].includes(api))&&req.method!=="POST")return out({error:"method_not_allowed"},405);
  const services=String(get("services")||"gaiheki,amamori").split(",");
  if(!services.length||services.some(s=>!["gaiheki","amamori"].includes(s)))return out({error:"invalid_services"},400);
  const asOf=get("snapshot")?new Date(String(get("snapshot"))):new Date();
  if(!Number.isFinite(asOf.getTime())||asOf.getTime()>Date.now()+60000||asOf.getTime()<new Date("2025-12-01T00:00:00+09:00").getTime())return out({error:"invalid_snapshot"},400);
  const secrets=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  const secret=secrets.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!secret)return out({error:"server_config"},500);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,secret,{auth:{persistSession:false}});
  if(api==='site_config'||api==='admin_site_config'){
   const {data,error}=await sb.from('lead_map_site_settings').select('payload,updated_at').eq('id','campaign').maybeSingle();
   if(error)return out({error:'config_unavailable'},500);
   return out({campaign:normalizeCampaign(data?.payload||{enabled:false}),updated_at:data?.updated_at||null});
  }
  if(api==='admin_save_campaign'){
   let campaign;try{campaign=normalizeCampaign(body.campaign)}catch{return out({error:'invalid_campaign'},400);}
   const {error}=await sb.from('lead_map_site_settings').upsert({id:'campaign',payload:campaign,updated_at:new Date().toISOString()});
   return error?out({error:'config_unavailable'},500):out({ok:true,campaign});
  }
  if(api==='admin_crm_search'){
   const q=String(body.query||'').normalize('NFKC').trim();
   if(q.length<2||q.length>80||/[\u0000-\u001f]/.test(q))return out({error:'invalid_query'},400);
   let query=sb.from('companies').select('id,public_id,company_name,phone,mobile,email,prefecture,city');
   if(body.field==='phone'){
    const phone=q.replace(/[\s()-]/g,'').replace(/^\+81/,'0');
    if(!/^0[0-9]{9,10}$/.test(phone))return out({error:'invalid_phone'},400);
    query=query.or('phone_norm.eq.'+phone+',mobile_norm.eq.'+phone);
   }else if(body.field==='id')query=query.eq('public_id',q);
   else query=query.ilike('company_name','%'+q.replace(/[\%_]/g,'')+'%');
   const {data,error}=await query.order('id').limit(20);
   return error?out({error:'crm_unavailable'},500):out({rows:data||[],limit:20});
  }
  if(api==='admin_crm_link'){
   const id=String(body.company_id||'');if(!/^[1-9][0-9]{0,17}$/.test(id))return out({error:'invalid_company'},400);
   const {data,error}=await sb.rpc('lead_map_link_crm_company_v1',{p_company_id:id});return error?out({error:'company_unavailable'},400):out(data);
  }
  if(api==="admin_report"){
   const days=Number(body.days??7);if(![1,7,30].includes(days))return out({error:"invalid_days"},400);
   const {data,error}=await sb.rpc("lead_map_admin_report_v2",{p_days:days});if(error)return out({error:"report_unavailable"},500);
   if(data?.contacts?.length){const extra=await sb.from('lead_map_contact_requests').select('request_id,case_snapshot').in('request_id',data.contacts.map((r:any)=>r.request_id));if(!extra.error){const notes=new Map((extra.data||[]).map((r:any)=>[r.request_id,r.case_snapshot?.inquiry_note||'']));data.contacts=data.contacts.map((r:any)=>({...r,message:notes.get(r.request_id)||''}));}}
   return out(data);
  }
  if(api==="admin_import_companies"){
   let rows;try{rows=normalizeCompanies(body)}catch(e){return out({error:String((e as Error).message)},400)}
   const {data,error}=await sb.rpc("lead_map_import_companies_v1",{p_rows:rows});return error?out({error:"import_unavailable"},500):out(data);
  }
  if(api==="admin_companies"){
   const offset=Number(body.offset??0);if(!Number.isInteger(offset)||offset<0)return out({error:"invalid_page"},400);
   const {data,error}=await sb.rpc("lead_map_list_companies_v1",{p_limit:500,p_offset:offset});return error?out({error:"list_unavailable"},500):out(data);
  }
  if(api==="admin_timeline"){
   if(!uuid.test(String(body.visit_id||"")))return out({error:"invalid_visit"},400);
   const {data,error}=await sb.from("lead_map_visit_events").select("created_at,kind,page,action,case_id,area,field,active_ms").eq("visit_id",body.visit_id).order("created_at",{ascending:true}).limit(500);return error?out({error:"report_unavailable"},500):out({events:data});
  }
  if(api==="admin_chat_test")return out(await postChat(CHAT_WEBHOOK,"【案件エリアマップ】通知接続テスト\nサイトのCVをこのチャットへ直接共有する設定を確認しました。これは実際の問い合わせではありません。メール通知先は亀井（t.kamei@madoguchi.inc）です。"));
  if(api==="admin_retry_chat"){
   if(!uuid.test(String(body.request_id||"")))return out({error:"invalid_request"},400);return out({chat_status:await deliverChat(sb,String(body.request_id),CHAT_WEBHOOK)});
  }
  if(api==="activity"){
   let input;try{input=normalizeActivity(body)}catch{return out({error:"invalid_activity"},400)}
   const {error}=await sb.rpc("lead_map_record_activity_v1",input);return error?out({error:"activity_unavailable"},429):out({ok:true});
  }
  if(api==="conversion_submit"){const r=await registerConversion(req,body,sb,ACCESS_HASH,sha256Hex,CHAT_WEBHOOK);return out(r.body,r.status);}
  if(api==="conversion_email_ack"){
   if(!uuid.test(String(body.request_id||"")))return out({error:"invalid_request"},400);
   const {error}=await sb.from("lead_map_contact_requests").update({email_ack_at:new Date().toISOString()}).eq("request_id",body.request_id).eq("access_hash",ACCESS_HASH);return error?out({error:"status_unavailable"},500):out({ok:true});
  }
  if(api==="contact_config")return out(contactConfig());
  if(api==="contact_submit"){const result=await submitContact(req,body,sb,ACCESS_HASH,sha256Hex);return out(result.body,result.status);}
  const common={p_since:"2025-11-30T15:00:00.000Z",p_services:services,p_as_of:asOf.toISOString()};
  if(["bootstrap","summary","metrics"].includes(api)){
   const {data,error}=await sb.rpc("lead_map_bootstrap_v2",common);
   if(error){console.error("lead-map bootstrap",error.code);return out({error:"data_unavailable"},500)}
   const visible=publicView?publicBootstrap(data):data;
   if(api==="summary")return out({rows:visible.rows,snapshot:visible.snapshot});
   if(api==="metrics")return out({...visible.metrics,snapshot:visible.snapshot});
   return out(visible);
  }
  if(api==="cases"||api==="case_filters"){
   const raw=get("keys");
   const keys=raw==null?null:Array.isArray(raw)?raw:String(raw).split(",").filter(Boolean);
   if(keys&&(keys.length>3000||keys.some(k=>typeof k!=="string"||k.length>100||!k.includes("|"))))return out({error:"invalid_keys"},400);
   if(api==="case_filters"){
    const {data,error}=await sb.rpc("lead_map_filter_options_v3",{...common,p_keys:keys});
    if(error)return out({error:"data_unavailable"},500);
    return out(publicView?publicFilterOptions(data):data);
   }
   let filters=get("filters")??{};
   if(typeof filters==="string"){try{filters=JSON.parse(filters)}catch{return out({error:"invalid_filters"},400)}}
   if(!filters||typeof filters!=="object"||Array.isArray(filters)||Object.keys(filters).length>12||Object.entries(filters).some(([k,v])=>k.length>160||typeof v!=="string"||!v||v.length>160||!(/^(service_code|items|recent_days|q:.+|d:(building_type|consideration_level|symptoms|story|age_of_building))$/.test(k))||(k==="recent_days"&&!["1","3","7","30"].includes(v))||(k==="service_code"&&!["gaiheki","amamori"].includes(v))))return out({error:"invalid_filters"},400);
   if(publicView&&Object.entries(filters).some(([k,v])=>!isPublicFilterValue(k,v)))return out({error:'invalid_filters'},400);
   const limit=Number(get("limit")??10),offset=Number(get("offset")??0);
   if(!Number.isInteger(limit)||limit<1||!Number.isInteger(offset)||offset<0)return out({error:"invalid_page"},400);
   const {data,error}=await sb.rpc("lead_map_page_v3",{...common,p_keys:keys,p_limit:Math.min(limit,50),p_offset:offset,p_filters:filters});
   if(error){console.error("lead-map page",error.code);return out({error:"data_unavailable"},500)}
   return out(publicView?publicPage(data):data);
  }
  return out({error:"not_found"},404);
 }catch{ return out({error:"request_failed"},500); }
});
