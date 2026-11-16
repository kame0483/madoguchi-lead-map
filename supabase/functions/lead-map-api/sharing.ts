// Public responses are constructed from a whitelist. Never spread a customer row.
export function publicCase(c:any){
 const q=c.detail?.chat_item||{},d=c.detail||{},facts:{label:string,value:string}[]=[];
 const fact=(label:string,value:unknown,pattern:RegExp)=>{const v=String(value??'').trim();if(pattern.test(v))facts.push({label,value:v});};
 fact('建物',d.building_type||q['物件の種類は？']||q['一戸建てですか？'],/^(一戸建て|戸建て|マンション|アパート|ビル|店舗|工場|倉庫|その他)$/);
 fact('階数',d.story||q['何回建てでしょうか？'],/^\d{1,2}階(?:建て)?$/);
 fact('築年数',d.age_of_building||q['築年数は？'],/^(\d{1,3}(?:[〜～~－-]\d{1,3})?年(?:未満|以内|以上)?|不明|わからない)$/);
 fact('工事予定',q['工事の予定はいつになりますか？'],/^(\d{1,2}(?:ヶ月|か月|月|年)以内|なるべく早く|できるだけ早く|未定|検討中)$/);
 const symptoms=['チョーキング','ひび割れ','色あせ','カビ','苔','雨漏り'].filter(x=>String(d.symptoms||'').includes(x));
 if(symptoms.length)facts.push({label:'症状',value:symptoms.join('・')});
 return {case_id:c.case_id,service_code:c.service_code,pref:c.pref,city:c.city,effective_at:c.effective_at,received_at:c.received_at,inquired_at:c.inquired_at,public_preview:true,public_facts:facts};
}
export function publicPage(data:any){return {total:data.total,area_total:data.area_total??data.total,snapshot:data.snapshot,cases:(data.cases||[]).map(publicCase),visibility:'public'};}
export function normalizeCampaign(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_campaign');
 const txt=(key:string,max:number)=>{const v=typeof value[key]==='string'?value[key].trim():'';if(v.length>max||/[\u0000-\u001f]/.test(v))throw Error('invalid_campaign');return v;};
 const enabled=value.enabled===true,title=txt('title',80),body=txt('body',500),terms=txt('terms',300),cta_label=txt('cta_label',40),cta_action=txt('cta_action',20)||'conditions',ends_on=txt('ends_on',10);
 if(!['materials','trial','conditions'].includes(cta_action)||enabled&&(!title||!body||!cta_label||!terms))throw Error('invalid_campaign');
 if(ends_on&&(!/^\d{4}-\d{2}-\d{2}$/.test(ends_on)||!Number.isFinite(new Date(ends_on+'T00:00:00Z').getTime())||new Date(ends_on+'T00:00:00Z').toISOString().slice(0,10)!==ends_on))throw Error('invalid_campaign');
 return {enabled,title,body,terms,cta_label,cta_action,ends_on};
}

export function publicBootstrap(data:any){return {snapshot:data.snapshot,metrics:{total:data.metrics.total,today:data.metrics.today,last7:data.metrics.last7},rows:(data.rows||[]).map((r:any)=>({pref:r.pref,city:r.city,service_code:r.service_code,case_count:r.case_count,latest_received_at:r.latest_received_at}))};}
