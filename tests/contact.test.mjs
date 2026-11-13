import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
let env={},sent=[],records=new Map(),providerStatus=202;
const context={console,Date,JSON,AbortController,setTimeout,clearTimeout,fetch:async(url,opt)=>{sent.push({url,body:JSON.parse(opt.body)});return new Response(null,{status:providerStatus,headers:{'x-message-id':'qa-provider-id'}})},Deno:{env:{get:k=>env[k]}}};
vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/lead-map-api/contact.ts',import.meta.url),'utf8').replace(/^export /gm,'')),context);
const base={request_id:'12345678-1234-4123-8123-123456789abc',action:'respond',case_id:null,company_name:'テスト株式会社',contact_name:'確認用',phone:'０９０-１２３４-５６７８',email:'Reply@EXAMPLE.invalid',preferred_date:null,preferred_window:'any'};
context.input=base;
const normalized=vm.runInContext('normalizeContact(input)',context);assert.equal(normalized.phone,'09012345678');assert.equal(normalized.email,'reply@example.invalid');
for(const update of [{email:'a@b\r\nBcc:leak@example.invalid'},{phone:'1234'},{preferred_date:'2026-02-30'},{company_name:'x\nBcc:z'},{request_id:'invalid'},{fax_address:'bot'}]){context.input={...base,...update};assert.throws(()=>vm.runInContext('normalizeContact(input)',context));}
context.row={...normalized,case_id:'case-123',case_snapshot:{pref:'岡山県',city:'岡山市北区',address:'内部通知用の住所',service_code:'gaiheki'}};
const admin=vm.runInContext('contactMail("admin",row)',context),receipt=vm.runInContext('contactMail("receipt",row)',context);
assert.equal(admin.to,'t.kamei@madoguchi.inc');assert.equal(receipt.to,'reply@example.invalid');assert.ok(admin.text.includes('内部通知用の住所'));assert.ok(!receipt.text.includes('内部通知用の住所'));assert.ok(receipt.text.includes('https://calendar.app.google/mRRBUfa9pHoPJVxeA'));
const sb={rpc:async(name,args)=>{
 if(name==='lead_map_register_contact_v1'){
  if(!records.has(args.p_request_id))records.set(args.p_request_id,{request_id:args.p_request_id,action:args.p_action,case_id:args.p_case_id,company_name:args.p_company_name,contact_name:args.p_contact_name,email:args.p_email,phone:args.p_phone,preferred_date:args.p_preferred_date,preferred_window:args.p_preferred_window,case_snapshot:{},admin_state:'pending',receipt_state:'pending'});
  return {data:records.get(args.p_request_id),error:null};
 }
 const r=records.get(args.p_request_id),kind=args.p_kind;
 if(kind==='receipt'&&r.admin_state!=='sent')return {data:null,error:null};
 if(!['pending','failed'].includes(r[kind+'_state']))return {data:null,error:null};r[kind+'_state']='sending';return {data:r,error:null};
},from:()=>({update:update=>({eq(){return this},then(resolve){Object.assign([...records.values()].at(-1),update);resolve({error:null})}}),select:()=>({eq:(_,id)=>({single:async()=>({data:records.get(id),error:null})})})})};
context.sb=sb;context.hash=async s=>createHash('sha256').update(s).digest('hex');context.request=new Request('https://example.invalid',{method:'POST'});context.input=base;
let result=await vm.runInContext('submitContact(request,input,sb,"qa-access-hash",hash)',context);assert.equal(result.status,503);assert.equal(records.size,0);assert.equal(sent.length,0);
env={SENDGRID_API_KEY:'qa-only-key'};
result=await vm.runInContext('submitContact(request,input,sb,"qa-access-hash",hash)',context);assert.equal(result.body.notification_status,'sent');assert.equal(result.body.receipt_status,'sent');assert.equal(sent.length,2);assert.equal(sent[0].body.personalizations[0].to[0].email,'t.kamei@madoguchi.inc');assert.equal(sent[1].body.personalizations[0].to[0].email,'reply@example.invalid');assert.ok(!JSON.stringify(result.body).includes('09012345678'));
await vm.runInContext('submitContact(request,input,sb,"qa-access-hash",hash)',context);assert.equal(sent.length,2,'same submission must not email twice');
records=new Map();sent=[];providerStatus=500;
result=await vm.runInContext('submitContact(request,input,sb,"qa-access-hash",hash)',context);assert.equal(result.body.notification_status,'failed');assert.equal(result.body.receipt_status,'pending');assert.equal(sent.length,1,'receipt waits for internal notification');
console.log('Contact: validation, fixed recipient, privacy, calendar URL, missing configuration, both emails, idempotency and provider failure passed');
for(const action of ['materials','trial']){
 context.input={...base,action};
 assert.equal(vm.runInContext('normalizeContact(input).action',context),action);
 context.row={...normalized,action,case_snapshot:{}};
 const adminIntent=vm.runInContext('contactMail("admin",row)',context),receiptIntent=vm.runInContext('contactMail("receipt",row)',context);
 assert.equal(adminIntent.to,'t.kamei@madoguchi.inc');
 assert.ok(adminIntent.subject.includes(action==='materials'?'資料':'トライアル'));
 assert.ok(receiptIntent.text.includes(action==='materials'?'サービス資料をご案内':'費用の適用範囲'));
 records=new Map();sent=[];providerStatus=202;
 const accepted=await vm.runInContext('submitContact(request,input,sb,"qa-access-hash",hash)',context);
 assert.equal(accepted.body.notification_status,'sent');assert.equal(accepted.body.receipt_status,'sent');assert.equal(sent.length,2);
 for(const field of ['company_name','contact_name','phone','email']){
  context.input={...base,action,[field]:''};assert.throws(()=>vm.runInContext('normalizeContact(input)',context),field+' must be required');
 }
}
console.log('Materials/trial: all four required fields, distinct internal notifications and truthful applicant receipts passed');
