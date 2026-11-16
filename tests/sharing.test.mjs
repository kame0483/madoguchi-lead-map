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

for(const [input,expected] of [['090-1234-****','090-1234-****'],['03-1234-****','03-1234-****'],['09012345678',''],['09012345678****',''],['invalid','']]){c.phone=input;assert.equal(vm.runInContext('maskedPublicPhone(phone)',c),expected);}
c.addressCase={pref:'東京都',city:'世田谷区',address:'〒123-4567 東京都世田谷区三軒茶屋2丁目10番5号 秘密マンション501'};assert.equal(vm.runInContext('publicTownAddress(addressCase)',c),'東京都世田谷区三軒茶屋');
c.addressCase.address='東京都世田谷区三軒茶屋一丁目秘密ビル';assert.equal(vm.runInContext('publicTownAddress(addressCase)',c),'東京都世田谷区三軒茶屋');
c.addressCase.address='東京都世田谷区秘密マンション';assert.equal(vm.runInContext('publicTownAddress(addressCase)',c),'東京都世田谷区');
c.more={case_id:'real-record',pref:'千葉県',city:'大網白里市',address:'千葉県大網白里市大網123番地秘密棟',masked_phone:'090-1234-****',items:'外壁 塗装 / 屋根 雨漏り・防水 / 101～150平米',detail:{chat_item:{'築年数は？':'20年〜','工事の予定はいつになりますか？':'〜6ヶ月','延べ床面積は、おおよそどのくらいでしょうか？':'101〜150㎡(31～45坪)','すでに見積もりはお持ちですか？':'いいえ','ヘアークラックはありますか？':'ある'}}};
const details=vm.runInContext('publicCase(more)',c);assert.ok(details.public_facts.some(f=>f.value==='20年以上'));assert.ok(details.public_facts.some(f=>f.value==='6ヶ月以内'));assert.ok(details.public_facts.some(f=>f.label==='延べ床面積'));assert.ok(details.public_facts.some(f=>f.value==='未取得'));assert.equal(details.display_address,'千葉県大網白里市大網');assert.equal(details.masked_phone,'090-1234-****');assert.ok(details.public_work.includes('外壁塗装'));assert.ok(!JSON.stringify(details).includes('123番地'));assert.ok(!JSON.stringify(details).includes('秘密棟'));
c.more.detail.chat_item['工事の予定はいつになりますか？']='すでに施工済み';assert.equal(vm.runInContext('publicCase(more).needs_status_check',c),true);
for(const pair of [['q:築年数は？','20年〜',true],['q:築年数は？','09012345678',false],['q:住所','東京都',false],['q:外壁材は？','山田様',false],['q:工事の予定はいつになりますか？','〜6ヶ月',true]]){c.k=pair[0];c.v=pair[1];assert.equal(vm.runInContext('isPublicFilterValue(k,v)',c),pair[2]);}
console.log('Case detail: database-masked phone only, town-only address, actual choice formats, safe facets and completed-work flag passed');
