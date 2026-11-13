import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,value:'',textContent:'',addEventListener(){},querySelector(){return node('intro')},querySelectorAll(){return []},scrollIntoView(){},focus(){}});return nodes.get(id)};
let requests=[],status=200,result={success:'true'};
const c={console,Map,Object,JSON,Date,Error,AbortController,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),crypto:{randomUUID:()=> '12345678-1234-4123-8123-123456789abc'},contactCases:new Map([['id1',{case_id:'id1',service_code:'gaiheki',address:'送信禁止住所',customer_surname:'送信禁止氏名',masked_phone:'090-0000-****'}]]),serviceLabel:()=> '外壁',CONTACT_EMAIL:'info@gaihekiplus.com',document:{getElementById:node,addEventListener(){}},fetch:async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return {ok:status===200,json:async()=>result}}};vm.createContext(c);vm.runInContext(readFileSync(new URL('../contact.js',import.meta.url),'utf8'),c);
const base={request_id:'12345678-1234-4123-8123-123456789abc',action:'materials',case_id:'id1',company_name:'テスト社',contact_name:'確認用',phone:'09000000000',email:'qa@example.invalid',preferred_date:null,preferred_window:'any',fax_address:''};
for(const action of ['materials','trial','respond','conditions']){
 c.input={...base,action};const r=await vm.runInContext('contactRequest(input)',c);assert.equal(r.request_id,base.request_id);
 const sent=requests.at(-1);assert.equal(sent.url,'https://formsubmit.co/ajax/info@gaihekiplus.com');assert.equal(sent.body['会社名'],base.company_name);assert.equal(sent.body['担当者名'],base.contact_name);assert.equal(sent.body.email,base.email);assert.equal(sent.body['案件ID'],'id1');assert.equal(sent.options.referrerPolicy,'origin');assert.equal(sent.options.credentials,'omit');assert.ok(!JSON.stringify(sent).includes('送信禁止'));assert.ok(!JSON.stringify(sent).includes('x-lead-map-key'));assert.ok(!('_autoresponse' in sent.body));assert.ok(!('_captcha' in sent.body));
}
result={success:true};await vm.runInContext('contactRequest(input)',c);
result={success:false,message:'This form needs Activation'};await assert.rejects(vm.runInContext('contactRequest(input)',c),/初回認証/);
result={success:true,message:'Activation required'};await assert.rejects(vm.runInContext('contactRequest(input)',c),/初回認証/);
result={success:false,message:'error'};await assert.rejects(vm.runInContext('contactRequest(input)',c),/確認できません/);
status=403;await assert.rejects(vm.runInContext('contactRequest(input)',c),/完了できません/);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const id of ['contactCompany','contactName','contactPhone','contactEmail'])assert.match(html,new RegExp('<input[^>]+id="'+id+'"[^>]+required'));
assert.ok(html.includes('FormSubmitを経由'));assert.ok(!html.includes('受付内容をお送りします'));
console.log('FormSubmit: all four intents, contact whitelist, no customer PII/key/referrer query, no autoresponse, required fields, activation/failure handling passed');
