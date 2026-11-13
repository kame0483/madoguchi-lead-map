import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
let records=new Map(),sent=[],providerStatus=200;
const sb={rpc:async(name,a)=>{
 if(name==='lead_map_register_contact_v1'){
  if(!records.has(a.p_request_id))records.set(a.p_request_id,{request_id:a.p_request_id,action:a.p_action,case_id:a.p_case_id,company_name:a.p_company_name,contact_name:a.p_contact_name,phone:a.p_phone,email:a.p_email,preferred_date:a.p_preferred_date,preferred_window:a.p_preferred_window,chat_state:'pending',case_snapshot:{address:'original-customer-address-do-not-send',pref:'岡山県',city:'岡山市北区',service_code:'gaiheki'}});
  return {data:records.get(a.p_request_id)};
 }
 if(name==='lead_map_claim_chat_v1'){const r=records.get(a.p_request_id);if(!['pending','failed'].includes(r.chat_state))return {data:null};r.chat_state='sending';return {data:{...r}};}
 throw Error('unexpected RPC');
},from:()=>({update:update=>({id:null,eq(k,v){if(k==='request_id')this.id=v;return this},is(){return this},then(resolve){Object.assign(records.get(this.id),update);resolve({error:null})}})})};
const c={console,Date,JSON,AbortController,setTimeout,clearTimeout,Deno:{env:{get(){}}},fetch:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({name:'spaces/test/messages/test'}),{status:providerStatus})}};
vm.createContext(c);
for(const file of ['contact.ts','activity.ts'])vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/lead-map-api/'+file,import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')),c);
c.input={request_id:'12345678-1234-4123-8123-123456789abc',visit_id:'22345678-1234-4123-8123-123456789abc',action:'materials',company_name:'確認会社',contact_name:'確認担当',phone:'09000000000',email:'qa@example.invalid',preferred_date:'2026-11-24',preferred_window:'now'};c.sb=sb;c.request=new Request('https://example.invalid',{method:'POST'});c.hash=async s=>createHash('sha256').update(s).digest('hex');
providerStatus=503;
let r=await vm.runInContext('registerConversion(request,input,sb,"qa-hash",hash,"https://chat.example.invalid")',c);assert.equal(r.status,200);assert.equal(r.body.chat_status,'failed');assert.equal(records.size,1);assert.equal([...records.values()][0].preferred_date,null);
providerStatus=200;
r=await vm.runInContext('registerConversion(request,input,sb,"qa-hash",hash,"https://chat.example.invalid")',c);assert.equal(r.body.chat_status,'sent');assert.equal(sent.length,2);assert.ok(sent[1].body.text.includes('今すぐ'));assert.ok(!JSON.stringify(sent).includes('original-customer-address'));
await vm.runInContext('registerConversion(request,input,sb,"qa-hash",hash,"https://chat.example.invalid")',c);assert.equal(sent.length,2,'successful Chat is not resent on email retries');
c.activity={visit_id:c.input.visit_id,device:'mobile',company_code:'okayama_01',events:[{event_id:c.input.request_id,kind:'button_click',page:'map',action:'materials',active_ms:12345,email:'must-not-store@example.invalid',url:'https://example.invalid/?k=do-not-store'}]};
const activity=vm.runInContext('normalizeActivity(activity)',c);assert.equal(activity.p_events.length,1);assert.ok(!JSON.stringify(activity).includes('must-not-store'));assert.ok(!JSON.stringify(activity).includes('do-not-store'));
for(const override of [{visit_id:'invalid'},{company_code:'https://secret.invalid'},{events:[]},{events:Array(21).fill(c.activity.events[0])},{events:[{...c.activity.events[0],active_ms:-1}]},{events:[{...c.activity.events[0],action:'raw-field-value'}]}]){c.invalid={...c.activity,...override};assert.throws(()=>vm.runInContext('normalizeActivity(invalid)',c));}
console.log('Activity: strict event whitelist, separate admin access, durable conversion before Chat, failed delivery retry, successful delivery deduplication and original-customer privacy passed');

c.companyInput={rows:[{company_name:'  確認用会社  ',recipient_email:'Sales@Example.invalid'}]};const companyRows=vm.runInContext('normalizeCompanies(companyInput)',c);assert.equal(companyRows[0].company_name,'確認用会社');assert.equal(companyRows[0].recipient_email,'sales@example.invalid');
for(const rows of [[],[{company_name:'会社',recipient_email:'bad'}],[{company_name:'会社\n追加',recipient_email:'qa@example.invalid'}],Array(501).fill({company_name:'会社',recipient_email:'qa@example.invalid'})]){c.companyInput={rows};assert.throws(()=>vm.runInContext('normalizeCompanies(companyInput)',c));}
