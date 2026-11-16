// Build public responses from a whitelist; never send full customer rows.
export function maskedPublicPhone(value:unknown){
 const v=String(value??'').normalize('NFKC').trim().replace(/[\s()-]/g,'');
 // Only accept a value that was already masked by the database.
 if(!/^0[1-9][0-9]{4,5}\*{4}$/.test(v))return '';
 const prefix=v.slice(0,-4);
 if(prefix.length===6&&/^0[36]/.test(prefix))return prefix.slice(0,2)+'-'+prefix.slice(2)+'-****';
 return prefix.slice(0,3)+'-'+prefix.slice(3)+'-****';
}
export function publicTownAddress(c:any){
 const clean=(v:unknown)=>String(v??'').normalize('NFKC').replace(/ヶ/g,'ケ').replace(/[\s　]/g,'');
 const pref=clean(c.pref),city=clean(c.city),base=pref+city;
 let address=clean(c.address).replace(/^〒?\d{3}-?\d{4}/,'');
 if(address.startsWith(pref))address=address.slice(pref.length);
 if(!city||!address.startsWith(city))return base;
 const tail=address.slice(city.length),boundary=tail.search(/[0-9０-９]|[一二三四五六七八九十百]+丁目/);
 if(boundary<0)return base;
 let town=tail.slice(0,boundary);
 if(!/^[一-龯々〆ヵケぁ-ゖ]{1,24}$/.test(town)||/(様|電話|連絡|メール|非公開|不明|未入力|マンション|ハイツ|ビル|アパート|コーポ|メゾン|レジデンス|ハイム|荘|寮|号室|棟|宅|邸|館)/.test(town))town='';
 return base+town;
}
export function publicCase(c:any){
 const q=c.detail?.chat_item||{},d=c.detail||{},facts:{label:string,value:string}[]=[],other:{label:string,value:string}[]=[],symptoms:string[]=[];
 const normalize=(v:unknown)=>String(v??'').normalize('NFKC').trim().replace(/[ 　]/g,'').replace(/[～~－]/g,'〜').replace(/m2|平米/g,'㎡');
 const fact=(label:string,value:unknown,pattern:RegExp,target=facts)=>{const v=normalize(value);if(pattern.test(v))target.push({label,value:v});};
 fact('建物',d.building_type||q['物件の種類は？']||q['一戸建てですか？'],/^(一戸建て|一戸建て以外|戸建て|一棟マンション|一棟アパート|マンション|アパート|ビル|店舗|工場|倉庫|その他)$/);
 fact('階数',d.story||q['何回建てでしょうか？'],/^\d{1,2}階(?:建て)?(?:以上)?$/);
 const age=normalize(d.age_of_building||q['築年数は？']).replace(/^(\d{1,3})年〜$/,'$1年以上');
 fact('築年数',age,/^(\d{1,3}(?:〜\d{1,3})?年(?:未満|以内|以上)?|不明|わからない)$/);
 let schedule=normalize(q['工事の予定はいつになりますか？']);
 schedule=schedule.replace(/^〜(\d{1,2}(?:ヶ月|か月|月|年))$/,'$1以内').replace(/^(\d{1,2}(?:ヶ月|か月|月|年))〜$/,'$1以上先');
 fact('工事予定',schedule,/^(\d{1,2}(?:ヶ月|か月|月|年)(?:以内|以上先)|なるべく早く|できるだけ早く|未定|検討中|すでに施工済み)$/);
 fact('延べ床面積',q['延べ床面積は、おおよそどのくらいでしょうか？'],/^\d{1,4}(?:〜\d{1,4})?㎡(?:\([\d〜坪]+\))?(?:以下|以上)?$/);
 const quote=normalize(q['すでに見積もりはお持ちですか？']);if(['はい','いいえ','取得済み','未取得'].includes(quote))facts.push({label:'見積取得',value:quote==='はい'?'取得済み':quote==='いいえ'?'未取得':quote});
 fact('外壁材',q['外壁材は？'],/^(サイディング|モルタル|ALC|タイル|コンクリート|金属|その他|わからない)$/);
 fact('屋根材',q['お住まいの屋根材はどちらになりますか？'],/^(スレート|瓦|トタン|ガルバリウム|ガルバリウム鋼板|その他|わからない)$/);
 fact('検討状況',d.consideration_level,/^(すぐ依頼したい|費用を知りたい|業者を探している|比較検討中|情報収集中|検討中|なるべく早く|まだ決めていない)$/);
 const positive=new Set(['はい','ある','あり','少しある','所々みられる','全体的にみられる','少し白くなる','写真のように白くなる','より大きなヒビがある']);
 for(const [key,label] of [['チョーキングはありますか？','チョーキング'],['ヘアークラックはありますか？','ひび割れ'],['外壁に色あせはみられますか？','色あせ'],['外壁にカビや苔はありますか？','カビ・苔'],['雨漏りや漏水の症状はありますか？','雨漏り・漏水'],['屋根材にひび割れや欠けはありますか？','屋根材のひび割れ']])if(positive.has(normalize(q[key])))symptoms.push(label+'あり');
 const rain=normalize(d.symptoms);if(rain&&!/(なし|ない|ありません|不明|わからない)/.test(rain))for(const word of ['雨漏り','天井','壁','屋根','ひび割れ'])if(rain.includes(word)&&!symptoms.includes(word))symptoms.push(word);
 fact('室外機',q['室外機はいくつありますか？'],/^(なし|\d{1,2}(?:〜\d{1,2})?台(?:以上|以下)?)$/,other);
 fact('隣家との距離',q['隣の家との距離はどのくらいですか？'],/^(\d{1,3}(?:〜\d{1,3})?(?:cm|m|メートル)(?:以上|以下|未満)?|人が通れる|人が通れない|わからない)$/,other);
 for(const [key,label] of [['ベランダや屋根にテレビやBSなどのアンテナは設置してますか？','アンテナ'],['お庭やベランダに移動できない木や草花はありますか？','庭木・草花'],['家が崖に隣接していたり、3メートル以上の高低差がある箇所はありますか？','崖・高低差']])fact(label,q[key],/^(はい|いいえ|ある|ない|あり|なし|わからない|不明|設置している|設置していない)$/,other);
 const rawItems=normalize(c.items),works=[];
 for(const [match,label] of [['外壁塗装','外壁塗装'],['屋根塗装','屋根塗装'],['外壁修理','外壁修理'],['屋根修理','屋根修理'],['屋根葺き替え','屋根葺き替え'],['屋根カバー','屋根カバー工法'],['シーリング','シーリング'],['防水','防水'],['雨漏り','雨漏り']])if(rawItems.includes(match))works.push(label);
 return {case_id:c.case_id,service_code:c.service_code,pref:c.pref,city:c.city,effective_at:c.effective_at,received_at:c.received_at,public_preview:true,public_facts:facts,public_other:other,public_symptoms:[...new Set(symptoms)],public_work:works.join('・')|| (c.service_code==='amamori'?'雨漏りのご相談':'外壁工事のご相談'),display_address:publicTownAddress(c),masked_phone:maskedPublicPhone(c.masked_phone),needs_status_check:schedule==='すでに施工済み'};
}
export function publicPage(data:any){return {total:data.total,area_total:data.area_total??data.total,snapshot:data.snapshot,cases:(data.cases||[]).map(publicCase),visibility:'public'};}
export function normalizeCampaign(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_campaign');
 const txt=(key:string,max:number)=>{const multiline=['body','terms'].includes(key);const v=typeof value[key]==='string'?value[key].trim().replace(/\r\n?/g,'\n'):'';if(v.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/:/[\u0000-\u001f]/).test(v))throw Error('invalid_campaign');return v;};
 const enabled=value.enabled===true,title=txt('title',80),body=txt('body',500),terms=txt('terms',300),cta_label=txt('cta_label',40),cta_action=txt('cta_action',20)||'conditions',ends_on=txt('ends_on',10);
 if(!['materials','trial','conditions'].includes(cta_action)||enabled&&(!title||!body||!cta_label||!terms))throw Error('invalid_campaign');
 if(ends_on&&(!/^\d{4}-\d{2}-\d{2}$/.test(ends_on)||!Number.isFinite(new Date(ends_on+'T00:00:00Z').getTime())||new Date(ends_on+'T00:00:00Z').toISOString().slice(0,10)!==ends_on))throw Error('invalid_campaign');
 return {enabled,title,body,terms,cta_label,cta_action,ends_on};
}

export function publicBootstrap(data:any){return {snapshot:data.snapshot,metrics:{total:data.metrics.total,today:data.metrics.today,last7:data.metrics.last7},rows:(data.rows||[]).map((r:any)=>({pref:r.pref,city:r.city,service_code:r.service_code,case_count:r.case_count,latest_received_at:r.latest_received_at}))};}

const publicFilterLabels:Record<string,string>={'q:物件の種類は？':'建物','q:一戸建てですか？':'建物','q:何回建てでしょうか？':'階数','q:築年数は？':'築年数','q:延べ床面積は、おおよそどのくらいでしょうか？':'延べ床面積','q:工事の予定はいつになりますか？':'工事予定','q:すでに見積もりはお持ちですか？':'見積取得','q:外壁材は？':'外壁材','q:お住まいの屋根材はどちらになりますか？':'屋根材','d:building_type':'建物','d:story':'階数','d:age_of_building':'築年数','d:consideration_level':'検討状況'};
export function isPublicFilterValue(key:string,value:unknown){
 if(typeof value!=='string'||value.length>160)return false;
 if(key==='service_code')return ['gaiheki','amamori'].includes(value);
 if(key==='recent_days')return ['1','3','7','30'].includes(value);
 const label=publicFilterLabels[key];if(!label)return false;
 const detail=key.startsWith('q:')?{chat_item:{[key.slice(2)]:value}}:{[key.slice(2)]:value};
 return publicCase({detail}).public_facts.some(f=>f.label===label);
}
export function publicFilterOptions(data:any){
 const fields:Record<string,unknown>={service_code:[{value:'gaiheki'},{value:'amamori'}]};
 for(const [key,options] of Object.entries(data.fields||{})){
  if(!publicFilterLabels[key]||!Array.isArray(options))continue;
  const safe=options.filter(o=>isPublicFilterValue(key,o?.value)).map(o=>({value:o.value,count:Number(o.count)||0}));if(safe.length)fields[key]=safe;
 }
 return {total:data.total,fields};
}
