"use strict";
let caseFacetContext="",caseFacetVersion=0,caseFacetFields={};
const caseFacetCache=new Map();
const filterLabels={service_code:"案件の種類",recent_days:"受付期間",items:"工事内容","q:物件の種類は？":"建物種別","q:一戸建てですか？":"建物（一戸建て）","q:何回建てでしょうか？":"階数","q:築年数は？":"築年数","q:延べ床面積は、おおよそどのくらいでしょうか？":"延べ床面積","q:工事の予定はいつになりますか？":"工事予定","q:すでに見積もりはお持ちですか？":"見積取得","q:外壁材は？":"外壁材","q:お住まいの屋根材はどちらになりますか？":"屋根材","d:building_type":"建物種別（雨漏り）","d:consideration_level":"検討状況（雨漏り）","d:symptoms":"症状（雨漏り）","d:story":"階数（雨漏り）","d:age_of_building":"築年数（雨漏り）"};
const filterFieldLabel=k=>filterLabels[k]||k.replace(/^[qd]:/,"");
const filterValueLabel=(k,v)=>k==="service_code"?serviceLabel(v):k==="recent_days"?({"1":"本日追加","3":"直近3日","7":"直近7日","30":"直近30日"})[v]:v;
function renderActiveCaseFilters(){
 const entries=Object.entries(caseFilters);
 $("caseFilterBadge").textContent=entries.length?entries.length+"条件で絞り込み中":"条件未指定";
 $("clearCaseFilters").hidden=!entries.length;
 $("activeCaseFilters").innerHTML=entries.map(([k,v])=>'<button type="button" class="filter-chip" data-remove-filter="'+esc(k)+'" aria-label="'+esc(filterFieldLabel(k)+'の条件を解除')+'">'+esc(filterFieldLabel(k))+"："+esc(filterValueLabel(k,v))+' <span aria-hidden="true">×</span></button>').join("");
}
function renderFilterValues(){
 const field=$("caseFilterField").value,options=caseFacetFields[field]||[];
 $("caseFilterValue").innerHTML='<option value="">条件を選択</option>'+options.map(o=>'<option value="'+esc(o.value)+'">'+esc(filterValueLabel(field,o.value))+(Number.isFinite(o.count)?"（"+fmt(o.count)+"件）":"")+'</option>').join("");
 $("caseFilterValue").disabled=!field;
}
async function loadCaseFilterOptions(){
 if(!snapshot){$("caseFilterStatus").textContent="案件データの読み込み後にご利用ください。";return;}
 const context=JSON.stringify([snapshot,service,view.keys]),version=++caseFacetVersion;
 $("caseFilterStatus").textContent="このエリアで選べる条件を確認しています…";$("addCaseFilter").disabled=true;
 try{
  let data=caseFacetCache.get(context);
  if(!data){data=await call({api:"case_filters",services:service==="all"?"gaiheki,amamori":service,keys:view.keys,snapshot});caseFacetCache.set(context,data)}
  if(version!==caseFacetVersion)return;
  caseFacetContext=context;
  caseFacetFields={recent_days:[{value:"1"},{value:"3"},{value:"7"},{value:"30"}],...(data.fields||{})};
  const previous=$("caseFilterField").value,rank=Object.keys(filterLabels);
  const fields=Object.keys(caseFacetFields).sort((a,b)=>{const x=rank.indexOf(a),y=rank.indexOf(b);return (x<0?999:x)-(y<0?999:y)||filterFieldLabel(a).localeCompare(filterFieldLabel(b),"ja")});
  $("caseFilterField").innerHTML='<option value="">項目を選択</option>'+fields.map(k=>'<option value="'+esc(k)+'">'+esc(filterFieldLabel(k))+'</option>').join("");
  $("caseFilterField").value=Object.hasOwn(caseFacetFields,previous)?previous:"";renderFilterValues();
  $("caseFilterStatus").textContent="エリア内の全"+fmt(data.total)+"件が検索対象です。条件を追加すると、すべてに一致する案件を表示します。";
 }catch(e){if(version===caseFacetVersion)$("caseFilterStatus").textContent=e.message||"条件を取得できませんでした。閉じてからもう一度お試しください。"}
 finally{if(version===caseFacetVersion)$("addCaseFilter").disabled=false;}
}
function syncCaseFilterContext(){
 renderActiveCaseFilters();
 const context=JSON.stringify([snapshot,service,view.keys]);
 if(context!==caseFacetContext){caseFacetVersion++;if($("caseFilterPanel").open)loadCaseFilterOptions();}
}
async function reloadFilteredCases(){const id=beginView({...view});await loadPage(id);}
$("caseFilterPanel").addEventListener("toggle",()=>{if($("caseFilterPanel").open)loadCaseFilterOptions()});
$("caseFilterField").addEventListener("change",renderFilterValues);
$("caseFilterForm").addEventListener("submit",e=>{
 e.preventDefault();const k=$("caseFilterField").value,v=$("caseFilterValue").value;
 if(!k||!v){$("caseFilterStatus").textContent="絞り込む項目と条件を選択してください。";return;}
 if(!Object.hasOwn(caseFilters,k)&&Object.keys(caseFilters).length>=12){$("caseFilterStatus").textContent="条件は12項目まで指定できます。不要な条件を解除してください。";return;}
 window.LeadMapActivity?.track("filter_apply",{field:k});caseFilters={...caseFilters,[k]:v};renderActiveCaseFilters();run(reloadFilteredCases);
});
$("activeCaseFilters").addEventListener("click",e=>{const b=e.target.closest?.("[data-remove-filter]");if(!b)return;delete caseFilters[b.dataset.removeFilter];renderActiveCaseFilters();run(reloadFilteredCases)});
$("clearCaseFilters").addEventListener("click",()=>{caseFilters={};renderActiveCaseFilters();run(reloadFilteredCases)});
renderActiveCaseFilters();
