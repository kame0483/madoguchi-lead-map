import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},value:'',disabled:false,innerHTML:'',textContent:'',setAttribute(){},scrollIntoView(){},focus(){}});return nodes.get(id)};
const c={el,URL,Blob,setTimeout,console,document:{querySelectorAll:()=>[],querySelector:()=>({addEventListener(){}})},esc:String,empty:()=>'',stamp:String,duration:String};vm.createContext(c);vm.runInContext(readFileSync(new URL('../admin-companies.js',import.meta.url),'utf8'),c);
c.text='会社名\tメールアドレス\r\n確認会社\tSales@example.invalid\r\n';let rows=vm.runInContext('parseCompanyList(text)',c);assert.equal(rows.length,1);assert.equal(rows[0].company_name,'確認会社');assert.equal(rows[0].recipient_email,'sales@example.invalid');
c.text='会社名,メールアドレス\n"確認,工務店",qa@example.invalid\n"確認""会社",qa2@example.invalid';rows=vm.runInContext('parseCompanyList(text)',c);assert.equal(rows[0].company_name,'確認,工務店');assert.equal(rows[1].company_name,'確認"会社');
for(const text of ['','会社名,メールアドレス\n会社,bad','"unclosed,qa@example.invalid','会社,qa@example.invalid,extra,fourth']){c.text=text;assert.throws(()=>vm.runInContext('parseCompanyList(text)',c));}
c.base='https://kame0483.github.io/madoguchi-lead-map/?k=qa-viewer&pref=岡山県&email=do-not-copy@example.invalid#remove';c.code='a'.repeat(32);const u=new URL(vm.runInContext('buildCompanyURL(base,code)',c));assert.equal(u.searchParams.get('company'),c.code);assert.equal(u.searchParams.get('k'),'qa-viewer');assert.equal(u.searchParams.get('pref'),'岡山県');assert.equal(u.searchParams.get('email'),null);assert.equal(u.hash,'');
for(const base of ['https://evil.invalid/?k=qa','https://kame0483.github.io/madoguchi-lead-map/','https://kame0483.github.io/madoguchi-lead-map/admin.html?k=qa']){c.base=base;assert.throws(()=>vm.runInContext('buildCompanyURL(base,code)',c));}
function visit(code,saved){
 let data=null,storage=null,n=0;const ctx={TOKEN:'qa-key',API:'https://example.invalid',params:new URLSearchParams({company:code}),performance:{now:()=>100},Date,JSON,Math,matchMedia:()=>({matches:true}),crypto:{randomUUID:()=>`12345678-1234-4123-8123-${String(++n).padStart(12,'0')}`},setInterval(){},window:{addEventListener(){}},document:{visibilityState:'visible',addEventListener(){}},sessionStorage:{getItem:()=>saved?JSON.stringify(saved):null,setItem:(_,value)=>storage=JSON.parse(value)},fetch:async(_,opt)=>{data=JSON.parse(opt.body);return {ok:true}}};
 vm.runInNewContext(readFileSync(new URL('../activity.js',import.meta.url),'utf8'),ctx);return {data,storage};
}
const prior={id:'99999999-1234-4123-8123-123456789abc',company:'a'.repeat(32),active:45000,updated:Date.now()};const same=visit('a'.repeat(32),prior);assert.equal(same.data.visit_id,prior.id);assert.equal(same.storage.active,45000);const other=visit('b'.repeat(32),prior);assert.notEqual(other.data.visit_id,prior.id);assert.equal(other.storage.active,0);assert.equal(other.data.company_code,'b'.repeat(32));
console.log('Company links: CSV/TSV parsing, stable opaque URL, viewer key kept client-side, URL data whitelist and visit separation on company changes passed');

c.text='会社名,メールアドレス,会社ID・電話番号\nメールなし工務店,,MF-0001';rows=vm.runInContext('parseCompanyList(text)',c);assert.equal(rows[0].recipient_email,'');assert.equal(rows[0].external_ref,'MF-0001');
c.text='会社名\t電話番号\nメールなし工務店\t０９０－００００－００００';rows=vm.runInContext('parseCompanyList(text)',c);assert.equal(rows[0].recipient_email,'');assert.equal(rows[0].external_ref,'09000000000');
c.text='会社名,会社ID\n同名工務店,MF-A\n同名工務店,MF-B';rows=vm.runInContext('parseCompanyList(text)',c);assert.equal(rows[0].external_ref,'MF-A');assert.equal(rows[1].external_ref,'MF-B');
for(const text of ['会社名,メールアドレス,会社ID・電話番号\n会社,,','会社名,会社ID\n会社,','会社名,メールアドレス,会社ID・電話番号\n会社,bad,MF-1']){c.text=text;assert.throws(()=>vm.runInContext('parseCompanyList(text)',c));}
console.log('Optional email: 2-column legacy lists, ID/phone alternatives and missing-identity rejection passed');

// Search/pagination must retain original indexes so copy never selects another company.
c.companies=Array.from({length:1200},(_,i)=>({company_name:'確認会社'+i,recipient_email:'qa'+i+'@example.invalid',external_ref:String(i),code:String(i).padStart(32,'0')}));
let page=vm.runInContext("companyResultPage(companies,'',119)",c);assert.equal(page.rows.length,10);assert.equal(page.rows[0].index,1190);assert.equal(page.rows[9].index,1199);assert.equal(page.last,119);
page=vm.runInContext("companyResultPage(companies,'qa1199@',0)",c);assert.equal(page.total,1);assert.equal(page.rows[0].index,1199);
assert.equal(vm.runInContext("companyResultPage(companies,'存在しない会社',999).rows.length",c),0);
assert.equal(vm.runInContext("singleCompanyEntry('確認工務店','phone','＋８１ ９０－１２３４－５６７８').external_ref",c),'09012345678');
assert.equal(vm.runInContext("singleCompanyEntry('確認工務店','email','Sales@example.invalid').recipient_email",c),'sales@example.invalid');
assert.equal(vm.runInContext("singleCompanyEntry('確認工務店','ref','MF-0001').external_ref",c),'MF-0001');
for(const expr of ["singleCompanyEntry('','phone','09012345678')","singleCompanyEntry('会社','phone','123')","singleCompanyEntry('会社','email','bad')","singleCompanyEntry('会社','ref','')"]){assert.throws(()=>vm.runInContext(expr,c));}
console.log('Single-company input and 1,200-company search/pagination with stable copy indexes passed');
