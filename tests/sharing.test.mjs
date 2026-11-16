import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const c={Date};vm.createContext(c);vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/lead-map-api/sharing.ts',import.meta.url),'utf8').replace(/^export /gm,'')),c);
c.value={enabled:true,title:'実施決定済みの案内',body:'対象会社に条件をご案内します',terms:'条件は担当者から説明します',cta_label:'対象条件を確認する',cta_action:'conditions',ends_on:'2026-12-31',secret:'never-copy'};
let campaign=vm.runInContext('normalizeCampaign(value)',c);assert.equal(campaign.ends_on,'2026-12-31');assert.equal(campaign.secret,undefined);
for(const changed of [{terms:''},{title:''},{cta_action:'https://evil.invalid'},{ends_on:'2026-02-30'},{title:'x'.repeat(81)},{body:'bad\u0000control'}]){c.bad={...c.value,...changed};assert.throws(()=>vm.runInContext('normalizeCampaign(bad)',c));}
c.row={case_id:'case1',pref:'岡山県',city:'岡山市北区',service_code:'gaiheki',customer_surname:'private-customer',address:'private-address',phone:'09012345678',email:'private@email.invalid',detail:{chat_item:{'物件の種類は？':'一戸建て','築年数は？':'15〜20年','何回建てでしょうか？':'private-name','その他':'private-free-text'}}};
const safe=vm.runInContext('publicCase(row)',c);assert.equal(safe.public_facts.length,2);assert.ok(!JSON.stringify(safe).includes('private'));assert.ok(!JSON.stringify(safe).includes('09012345678'));assert.equal(safe.case_id,'case1');
c.row.detail.chat_item['築年数は？']='電話09012345678';assert.equal(vm.runInContext('publicCase(row).public_facts.length',c),1);
c.data={snapshot:'2026-11-16',metrics:{total:3,today:1,last7:2,private:'private'},rows:[{pref:'岡山県',city:'岡山市',service_code:'gaiheki',case_count:3,address:'private'}],private:'private'};
assert.ok(!JSON.stringify(vm.runInContext('publicBootstrap(data)',c)).includes('private'));
console.log('Sharing: public response allowlist, categorical-only preview facts, campaign limits/conditions/date and payload whitelist passed');

c.value.body='対象エリアのご案内\n条件を確認してください。';assert.match(vm.runInContext('normalizeCampaign(value).body',c),/\n/);
