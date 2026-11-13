import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../thanks.js',import.meta.url),'utf8');
const id='12345678-1234-4123-8123-123456789abc';
function render(hash,saved){const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true,addEventListener(){}});return nodes.get(id)};const c={URLSearchParams,location:{hash},sessionStorage:{getItem:()=>JSON.stringify(saved)},document:{getElementById:get},history:{length:1,back(){}}};vm.createContext(c);vm.runInContext(source,c);return {get,c};}
for(const action of ['materials','trial','respond','conditions']){const {get}=render('#receipt='+id+'&intent='+action,{request_id:id,preferred_date:'2026-11-24',preferred_window:'20:00-21:00'});assert.equal(get('thanksSummary').hidden,false);assert.equal(get('thanksDate').textContent,'2026/11/24');assert.equal(get('thanksTime').textContent,'20:00〜21:00');assert.ok(get('thanksCopy').textContent);}
assert.equal(render('',{}).get('thanksSummary').hidden,true);
assert.equal(render('#receipt='+id+'&intent=__proto__',{}).get('thanksSummary').hidden,true);
assert.equal(render('#receipt='+id+'&intent=materials',{request_id:'other',preferred_date:'2026-11-24'}).get('thanksDate').textContent,'指定なし');
console.log('Thanks: all intents, selected date/time, safe direct visit, stale/malformed receipt handling passed');
