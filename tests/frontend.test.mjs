import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const nodes=new Map();
class Element {constructor(){this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.children=[];}addEventListener(){}setAttribute(){}append(x){this.children.push(x)}replaceChildren(){this.children=[];this.innerHTML=''}insertAdjacentHTML(_,s){this.innerHTML+=s}scrollIntoView(){}}
const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
let calls=[];
const context={window:{addEventListener(){}},console,URL,URLSearchParams,Intl,Date,Map,Set,AbortController,setTimeout,clearTimeout,matchMedia:()=>({matches:true}),location:{search:'?k=qa-token',href:'https://example.invalid/?k=qa-token'},history:{replaceState(){}},document:{getElementById:get,createElement:()=>new Element()},fetch:async(url,opt)=>{if(!String(url).includes('lead-map-api'))throw Error('No initial coordinate loading expected');const d=JSON.parse(opt.body);calls.push(d);const matchTotal=d.keys?.length===0?0:d.filters?.['q:築年数は？']?15:120;return {ok:true,json:async()=>({total:matchTotal,area_total:d.keys?.length===0?0:120,cases:Array.from({length:Math.min(d.limit,matchTotal-d.offset)},(_,i)=>({case_id:'id-'+(d.offset+i),service_code:'gaiheki',pref:'岡山県',city:'岡山市北区',inquired_at:'2026-11-13T01:00:00Z',masked_phone:'090-1234-****',address:'岡山県',items:'外壁塗装'}))})}}};
vm.createContext(context);
let source=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/initMap\(\);\s*run\(bootstrap\);\s*$/,'');
vm.runInContext(source,context);
vm.runInContext('snapshot="2026-11-13T06:00:00Z";summaries=[{pref:"岡山県",city:"岡山市北区",service_code:"gaiheki",case_count:120}];',context);
await vm.runInContext('showJapan()',context);assert.equal(calls[0].limit,10);assert.equal(calls[0].offset,0);assert.equal(vm.runInContext('pageCount',context),10);
await vm.runInContext('loadPage()',context);assert.equal(calls[1].offset,10);assert.equal(vm.runInContext('pageCount',context),20);assert.equal(vm.runInContext('seen.size',context),20);
for(let i=0;i<10;i++)await vm.runInContext('loadPage()',context);assert.equal(vm.runInContext('pageCount',context),120);assert.equal(get('loadMore').hidden,true);
vm.runInContext('caseFilters={"q:築年数は？":"25〜30年"}',context);await vm.runInContext('showJapan()',context);assert.equal(vm.runInContext('pageCount',context),10);assert.equal(vm.runInContext('pageTotal',context),15);assert.match(get('sub').textContent,/地域全体120件.*条件に一致15件/);await vm.runInContext('loadPage()',context);assert.equal(vm.runInContext('pageCount',context),15);assert.equal(get('loadMore').hidden,true);assert.equal(calls.at(-1).filters['q:築年数は？'],'25〜30年');vm.runInContext('caseFilters={}',context);
await vm.runInContext('beginView({kind:"city",label:"案件なし",keys:[],pref:""});loadPage()',context);assert.deepEqual(calls.at(-1).keys,[]);assert.match(get('pageStatus').textContent,/全0件/);
assert.equal(vm.runInContext('isNewCase({inquired_at:"2099-01-01"})',context),false);
assert.equal(vm.runInContext('noCounty("上郡町")',context),'上郡町');assert.equal(vm.runInContext('noCounty("赤穂郡上郡町")',context),'上郡町');
const mail=vm.runInContext('responseMail({case_id:"case-1",service_code:"gaiheki",pref:"岡山県",city:"岡山市北区",address:"岡山県の住所",inquired_at:"2026-11-13T00:00:00Z"},"対応")',context);const u=new URL(mail);assert.equal(u.pathname,'t.kamei@madoguchi.inc');for(const label of ['案件ID：case-1','種別：外壁','エリア：岡山県 岡山市北区','住所：岡山県の住所','申込日時：2026-11-13T00:00:00Z'])assert.ok(u.searchParams.get('body').includes(label));
const escaped=vm.runInContext('cardHTML({pref:"<script>",city:"テスト",service_code:"gaiheki",customer_surname:"",address:"",items:"",inquired_at:"2026-11-13"})',context);assert.ok(!escaped.includes('<script>'));assert.ok(escaped.includes('お客様'));
console.log('Frontend: 10→20→120 pagination, zero areas, lazy geo, surname fallback, XSS escaping, future-date badge and CTA contents passed');

context.points=Array.from({length:47},(_,i)=>({x:140+i%3,y:170+i%4,size:i<8?42:36,pref:'地域'+i}));
const layout=vm.runInContext('layoutNationalMarkers(points,320,350)',context);assert.equal(layout.length,47);assert.equal(context.points[0].x,140);
for(const n of layout){assert.ok(n.x>=n.size/2&&n.x<=320-n.size/2);assert.ok(n.y>=n.size/2&&n.y<=350-n.size/2);}
let worst=0;for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++)worst=Math.max(worst,(layout[i].size+layout[j].size)/2-Math.hypot(layout[i].x-layout[j].x,layout[i].y-layout[j].y));assert.ok(worst<1,'47 labels should remain readable in a 320px-wide map');
console.log('National map: 47 callout labels avoid overlap on a phone without changing original locations');
