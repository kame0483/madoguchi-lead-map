import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},value:'',disabled:false,innerHTML:'',textContent:''});return nodes.get(id)};
const c={el,URL,Blob,setTimeout,console,esc:String,empty:()=>'',stamp:String,duration:String};vm.createContext(c);vm.runInContext(readFileSync(new URL('../admin-companies.js',import.meta.url),'utf8'),c);
c.text='会社名\tメールアドレス\r\n確認会社\tSales@example.invalid\r\n';let rows=vm.runInContext('parseCompanyList(text)',c);assert.equal(rows.length,1);assert.equal(rows[0].company_name,'確認会社');assert.equal(rows[0].recipient_email,'sales@example.invalid');
c.text='会社名,メールアドレス\n"確認,工務店",qa@example.invalid\n"確認""会社",qa2@example.invalid';rows=vm.runInContext('parseCompanyList(text)',c);assert.equal(rows[0].company_name,'確認,工務店');assert.equal(rows[1].company_name,'確認"会社');
for(const text of ['','会社名,メールアドレス\n会社,bad','"unclosed,qa@example.invalid','会社,qa@example.invalid,extra']){c.text=text;assert.throws(()=>vm.runInContext('parseCompanyList(text)',c));}
c.base='https://kame0483.github.io/madoguchi-lead-map/?k=qa-viewer&pref=岡山県&email=do-not-copy@example.invalid#remove';c.code='a'.repeat(32);const u=new URL(vm.runInContext('buildCompanyURL(base,code)',c));assert.equal(u.searchParams.get('company'),c.code);assert.equal(u.searchParams.get('k'),'qa-viewer');assert.equal(u.searchParams.get('pref'),'岡山県');assert.equal(u.searchParams.get('email'),null);assert.equal(u.hash,'');
for(const base of ['https://evil.invalid/?k=qa','https://kame0483.github.io/madoguchi-lead-map/','https://kame0483.github.io/madoguchi-lead-map/admin.html?k=qa']){c.base=base;assert.throws(()=>vm.runInContext('buildCompanyURL(base,code)',c));}
function visit(code,saved){
 let data=null,storage=null,n=0;const ctx={TOKEN:'qa-key',API:'https://example.invalid',params:new URLSearchParams({company:code}),performance:{now:()=>100},Date,JSON,Math,matchMedia:()=>({matches:true}),crypto:{randomUUID:()=>`12345678-1234-4123-8123-${String(++n).padStart(12,'0')}`},setInterval(){},window:{addEventListener(){}},document:{visibilityState:'visible',addEventListener(){}},sessionStorage:{getItem:()=>saved?JSON.stringify(saved):null,setItem:(_,value)=>storage=JSON.parse(value)},fetch:async(_,opt)=>{data=JSON.parse(opt.body);return {ok:true}}};
 vm.runInNewContext(readFileSync(new URL('../activity.js',import.meta.url),'utf8'),ctx);return {data,storage};
}
const prior={id:'99999999-1234-4123-8123-123456789abc',company:'a'.repeat(32),active:45000,updated:Date.now()};const same=visit('a'.repeat(32),prior);assert.equal(same.data.visit_id,prior.id);assert.equal(same.storage.active,45000);const other=visit('b'.repeat(32),prior);assert.notEqual(other.data.visit_id,prior.id);assert.equal(other.storage.active,0);assert.equal(other.data.company_code,'b'.repeat(32));
console.log('Company links: CSV/TSV parsing, stable opaque URL, viewer key kept client-side, URL data whitelist and visit separation on company changes passed');
