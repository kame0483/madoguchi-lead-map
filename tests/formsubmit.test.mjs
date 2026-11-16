import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,value:'',textContent:'',addEventListener(){},querySelector(){return node('intro')},querySelectorAll(){return []},scrollIntoView(){},focus(){}});return nodes.get(id)};
let requests=[],status=200,result={success:'true'};
let destination=null,stored=null;
let registrations=[],registerFailure=false;const c={window:{addEventListener(){}},call:async data=>{registrations.push(data);if(registerFailure)throw Error("受付を保存できませんでした");return {request_id:data.request_id,email_acknowledged:false}},URLSearchParams,location:{assign:url=>{destination=url}},sessionStorage:{setItem:(_,value)=>{stored=JSON.parse(value)}},console,Map,Object,JSON,Date,Error,AbortController,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'},contactCases:new Map([['id1',{case_id:'id1',service_code:'gaiheki',address:'送信禁止住所',customer_surname:'送信禁止氏名',masked_phone:'090-0000-****'}]]),serviceLabel:()=> '外壁',CONTACT_EMAIL:'t.kamei@madoguchi.inc',document:{getElementById:node,addEventListener(){}},fetch:async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return {ok:status===200,json:async()=>result}}};vm.createContext(c);vm.runInContext(readFileSync(new URL('../contact.js',import.meta.url),'utf8'),c);
const base={request_id:'12345678-1234-4123-8123-123456789abc',action:'materials',case_id:'id1',company_name:'テスト社',contact_name:'確認用',phone:'09000000000',email:'qa@example.invalid',preferred_date:null,preferred_window:'any',fax_address:''};
for(const action of ['materials','trial','respond','conditions']){
 c.input={...base,action};const r=await vm.runInContext('contactRequest(input)',c);assert.equal(r.request_id,base.request_id);
 const sent=requests.at(-1);assert.ok(sent.body._subject.startsWith('【資料ダウンロード】'));if(action==='respond')assert.equal(sent.body._subject,'【資料ダウンロード】この案件への対応希望 / テスト社');if(action==='materials')assert.equal(sent.body._subject,'【資料ダウンロード】サービス資料のご請求 / テスト社'); assert.equal(sent.url,'https://formsubmit.co/ajax/t.kamei@madoguchi.inc');assert.equal(sent.body['会社名'],base.company_name);assert.equal(sent.body['担当者名'],base.contact_name);assert.equal(sent.body.email,base.email);assert.equal(sent.body['案件ID'],'id1');assert.equal(sent.options.referrerPolicy,'origin');assert.equal(sent.options.credentials,'omit');assert.ok(!JSON.stringify(sent).includes('送信禁止'));assert.ok(!JSON.stringify(sent).includes('x-lead-map-key'));assert.ok(!('_autoresponse' in sent.body));assert.ok(!('_captcha' in sent.body));
}
result={success:true};await vm.runInContext('contactRequest(input)',c);
result={success:false,message:'This form needs Activation'};await assert.rejects(vm.runInContext('contactRequest(input)',c),/初回認証/);
result={success:true,message:'Activation required'};await assert.rejects(vm.runInContext('contactRequest(input)',c),/初回認証/);
result={success:false,message:'error'};await assert.rejects(vm.runInContext('contactRequest(input)',c),/確認できません/);
status=403;await assert.rejects(vm.runInContext('contactRequest(input)',c),/完了できません/);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const id of ['contactCompany','contactName','contactPhone','contactEmail'])assert.match(html,new RegExp('<input[^>]+id="'+id+'"[^>]+required'));
assert.ok(html.includes('FormSubmitを経由'));assert.ok(!html.includes('受付内容をお送りします'));
console.log('FormSubmit: all four intents, contact whitelist, no customer PII/key/referrer query, no autoresponse, required fields, activation/failure handling passed');


// New standard form transport supports FormSubmit autoresponse; no provider call is made here.
let nativeSent=[];c.URL=URL;
c.location.href='https://example.invalid/map/index.html?k=never-forward';
c.document.body={append(){}};
c.document.createElement=tag=>tag==='form'?{fields:[],append(input){this.fields.push(input)},submit(){nativeSent.push({url:this.action,method:this.method,body:Object.fromEntries(this.fields.map(i=>[i.name,i.value]))})}}:{};
const form=node('contactForm');form.checkValidity=()=>true;form.querySelector=()=>({value:'20:00-21:00'});form.querySelectorAll=()=>[];
for(const [id,value] of Object.entries({contactCompany:'テスト社',contactName:'確認担当',contactPhone:'090-0000-0000',contactEmail:'qa@example.invalid',contactDate:'2026-11-24',contactMessage:'紹介費用を知りたいです。\n年明けから対応可能です。'}))node(id).value=value;
status=200;result={success:true};destination=null;
await vm.runInContext('handleContactSubmit()',c);
assert.equal(nativeSent.length,1);assert.equal(destination,null,'wait for provider redirect; never show premature thanks');
const native=nativeSent[0];assert.equal(native.url,'https://formsubmit.co/t.kamei@madoguchi.inc');assert.equal(native.method,'POST');assert.ok(native.body._autoresponse.includes('calendar.app.google'));assert.ok(!('_captcha' in native.body));assert.ok(native.body._next.startsWith('https://example.invalid/map/thanks.html#'));assert.ok(!native.body._next.includes('never-forward'));assert.ok(!native.body._next.includes('qa@'));assert.equal(native.body['質問・ご要望'],'紹介費用を知りたいです。\n年明けから対応可能です。');
assert.equal(registrations.at(-1).form_version,2);assert.equal(registrations.at(-1).message,native.body['質問・ご要望']);vm.runInContext('contactNavigating=false;contactSetBusy(false)',c);assert.equal(stored.preferred_window,'20:00-21:00');assert.ok(!JSON.stringify(stored).includes('090'));
form.querySelector=()=>null;const beforeMissing=nativeSent.length;await vm.runInContext('handleContactSubmit()',c);assert.equal(nativeSent.length,beforeMissing);assert.match(node('contactError').textContent,/希望時間/);
form.querySelector=()=>({value:'now'});await vm.runInContext('handleContactSubmit()',c);assert.equal(nativeSent.at(-1).body['電話可能時間帯'],'今すぐ');assert.equal(stored.preferred_date,null);vm.runInContext('contactNavigating=false;contactSetBusy(false)',c);
const slots=[...html.matchAll(/name="callback_time" value="(\d\d:00-\d\d:00)" required/g)].map(x=>x[1]);assert.equal(slots.length,12);assert.ok(!html.includes('value="any"'));assert.ok(html.includes('id="contactMessage"'));
registerFailure=true;const beforeFailure=nativeSent.length;await vm.runInContext('handleContactSubmit()',c);assert.equal(nativeSent.length,beforeFailure);assert.equal(node('contactError').hidden,false);
c.IS_DEMO=true;registerFailure=false;const sentBeforeDemo=nativeSent.length,registeredBeforeDemo=registrations.length,savedBeforeDemo=stored;destination=null;
await assert.rejects(vm.runInContext('contactRequest(input)',c),/デモ/);await vm.runInContext('handleContactSubmit()',c);assert.equal(nativeSent.length,sentBeforeDemo);assert.equal(registrations.length,registeredBeforeDemo);assert.equal(destination,null);assert.equal(stored,savedBeforeDemo);assert.equal(node('contactSuccessHeading').textContent,'デモ入力を確認しました');assert.equal(node('contactResources').hidden,true);
console.log('Native transport: durable intake before POST, fixed Kamei recipient, autoresponse with CAPTCHA enabled, safe return URL, mandatory time, notes and notification-free demo passed');
