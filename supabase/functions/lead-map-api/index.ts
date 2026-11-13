import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { ACCESS_HASH } from "./access-config.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-lead-map-key","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
async function sha256Hex(input:string){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input));return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function out(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(!["GET","POST"].includes(req.method))return out({error:"method_not_allowed"},405);
 try{
  const url=new URL(req.url),token=req.headers.get("x-lead-map-key")||url.searchParams.get("k")||"";
  if(!token||await sha256Hex(token)!==ACCESS_HASH)return out({error:"forbidden"},403);
  const text=req.method==="POST"?await req.text():"{}";
  if(text.length>160000)return out({error:"request_too_large"},413);
  let body:Record<string,unknown>;try{body=JSON.parse(text)}catch{return out({error:"invalid_json"},400)}
  if(!body||Array.isArray(body)||typeof body!=="object")return out({error:"invalid_request"},400);
  const get=(k:string)=>body[k]??url.searchParams.get(k);
  const services=String(get("services")||"gaiheki,amamori").split(",");
  if(!services.length||services.some(s=>!["gaiheki","amamori"].includes(s)))return out({error:"invalid_services"},400);
  const api=String(get("api")||"summary");
  const asOf=get("snapshot")?new Date(String(get("snapshot"))):new Date();
  if(!Number.isFinite(asOf.getTime())||asOf.getTime()>Date.now()+60000||asOf.getTime()<new Date("2025-12-01T00:00:00+09:00").getTime())return out({error:"invalid_snapshot"},400);
  const secrets=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  const secret=secrets.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!secret)return out({error:"server_config"},500);
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,secret,{auth:{persistSession:false}});
  const common={p_since:"2025-11-30T15:00:00.000Z",p_services:services,p_as_of:asOf.toISOString()};
  if(["bootstrap","summary","metrics"].includes(api)){
   const {data,error}=await sb.rpc("lead_map_bootstrap_v2",common);
   if(error){console.error("lead-map bootstrap",error.code);return out({error:"data_unavailable"},500)}
   if(api==="summary")return out({rows:data.rows,snapshot:data.snapshot});
   if(api==="metrics")return out({...data.metrics,snapshot:data.snapshot});
   return out(data);
  }
  if(api==="cases"){
   const raw=get("keys");
   const keys=raw==null?null:Array.isArray(raw)?raw:String(raw).split(",").filter(Boolean);
   if(keys&&(keys.length>3000||keys.some(k=>typeof k!=="string"||k.length>100||!k.includes("|"))))return out({error:"invalid_keys"},400);
   const limit=Number(get("limit")??50),offset=Number(get("offset")??0);
   if(!Number.isInteger(limit)||limit<1||!Number.isInteger(offset)||offset<0)return out({error:"invalid_page"},400);
   const {data,error}=await sb.rpc("lead_map_page_v2",{...common,p_keys:keys,p_limit:Math.min(limit,50),p_offset:offset});
   if(error){console.error("lead-map page",error.code);return out({error:"data_unavailable"},500)}
   return out(data);
  }
  return out({error:"not_found"},404);
 }catch{ return out({error:"request_failed"},500); }
});
