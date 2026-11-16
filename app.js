"use strict";
const API="https://mhlrawabzltuauramxps.supabase.co/functions/v1/lead-map-api";
const params=new URLSearchParams(location.search);
const IS_DEMO=params.get("demo")==="campaign";
const TOKEN=IS_DEMO?"":params.get("k")||"";
const CALENDAR_URL="https://calendar.app.google/mRRBUfa9pHoPJVxeA";
const CONTACT_EMAIL="t.kamei@madoguchi.inc";
const contactCases=new Map();
const PAGE_SIZE=10;
let caseFilters={};
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat("ja-JP").format(Number(n||0));
const norm=s=>String(s||"").normalize("NFKC").replace(/ヶ/g,"ケ").replace(/[\s　]/g,"").trim();
const key=(p,c)=>p+"|"+norm(c);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const serviceLabel=s=>s==="amamori"?"雨漏り":"外壁";
const dateText=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(d):"受付日未登録"};
let summaries=[],snapshot=null,service="all",geoIndex=null;
const geoCache=new Map();
let map=null,layer=null,rangeCircle=null,baseTiles=null,japanOutline=null,outlineJob=null,view={kind:"nation",label:"全国",keys:null,pref:""},generation=0,pageController=null,pageLoading=false,pageCount=0,pageTotal=0,seen=new Set();
async function call(data,signal){
 if(IS_DEMO&&["activity","conversion_submit","conversion_email_ack","contact_submit"].includes(data.api))throw new Error("デモ画面のため送信は行いません。");
 const controller=new AbortController();
 const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener("abort",abort,{once:true});
 const timer=setTimeout(abort,20000);
 try{
  const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json","x-lead-map-key":TOKEN},body:JSON.stringify(data),signal:controller.signal,cache:"no-store",referrerPolicy:"no-referrer"});
  if(!r.ok)throw new Error(r.status===403?"閲覧キーを確認できませんでした。担当者から届いたURLをご確認ください。":"データを取得できませんでした。再度お試しください。");
  return await r.json();
 }catch(e){if(controller.signal.aborted&&!signal?.aborted)throw new Error("通信に時間がかかっています。再度お試しください。");throw e}
 finally{clearTimeout(timer);signal?.removeEventListener("abort",abort)}
}
function currentSummary(){return summaries.filter(x=>service==="all"||x.service_code===service)}
function totalsByPref(){const m=new Map();currentSummary().forEach(x=>m.set(x.pref,(m.get(x.pref)||0)+Number(x.case_count)));return m}
function totalsByCity(pref){const m=new Map();currentSummary().filter(x=>!pref||x.pref===pref).forEach(x=>m.set(key(x.pref,x.city),(m.get(key(x.pref,x.city))||0)+Number(x.case_count)));return m}
function sumKeys(keys){const m=totalsByCity();return keys===null?[...m.values()].reduce((a,b)=>a+b,0):keys.reduce((a,k)=>a+(m.get(k)||0),0)}
function report(e){if(e.name!=="AbortError")$("searchStatus").textContent=e.message||"読み込めませんでした。再度お試しください。"}
function run(fn){Promise.resolve().then(fn).catch(report)}
function setSearchBusy(b){$("go").disabled=b;$("go").textContent=b?"検索中…":"このエリアを検索"}
function hav(a,b){const R=6371,t=x=>x*Math.PI/180,dlat=t(b.lat-a.lat),dlng=t(b.lng-a.lng);const x=Math.sin(dlat/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dlng/2)**2;return 2*R*Math.asin(Math.sqrt(Math.min(1,x)))}
async function ensureIndex(){if(geoIndex)return geoIndex;const r=await fetch("assets/geo/index.json");if(!r.ok)throw new Error("地域一覧を取得できませんでした。");geoIndex=await r.json();return geoIndex}
async function ensureGeo(pref){
 if(geoCache.has(pref))return geoCache.get(pref);
 const i=Object.keys(PREF_CENTERS).indexOf(pref)+1;if(!i)return [];
 const job=fetch("assets/geo/"+String(i).padStart(2,"0")+".json").then(r=>{if(!r.ok)throw new Error("地域の地図データを取得できませんでした。");return r.json()}).then(a=>a.map(g=>({...g,pref,city:norm(g.city)}))).catch(e=>{geoCache.delete(pref);throw e});
 geoCache.set(pref,job);return job;
}
function noCounty(s){return norm(s).replace(/^.+?郡(?=.{2,}$)/,"")}
function findGeo(rows,city){const aliases={"三宅島三宅村":"三宅村","八丈島八丈町":"八丈町"};const n=aliases[norm(city)]||norm(city);return rows.find(g=>g.city===n)||rows.find(g=>noCounty(g.city)===noCounty(n))}
function initMap(){
 if(typeof L==="undefined"){ $("map").innerHTML='<div class="empty">地図を読み込めませんでした。下の地域選択と案件一覧をご利用ください。</div>';return;}
 const bounds=L.latLngBounds([23,122],[46.5,147]);
 map=L.map("map",{maxBounds:bounds,maxBoundsViscosity:1,minZoom:4,maxZoom:12,scrollWheelZoom:false,worldCopyJump:false,zoomSnap:0.25,zoomDelta:0.5}).setView([36,137.5],4);
 const tiles=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:12,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',noWrap:true,bounds,referrerPolicy:'origin'});baseTiles=tiles;
 let tileErrors=0,fallback=false;
 tiles.on('tileerror',()=>{if(++tileErrors<3||fallback)return;fallback=true;tiles.remove();baseTiles=L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',{maxZoom:12,noWrap:true,bounds,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'});if(view.kind!=='nation')baseTiles.addTo(map)});
 layer=L.layerGroup().addTo(map);
 map.on('zoomend moveend resize',()=>{if(snapshot&&view.kind==='nation')renderNationalMarkers()});
}
function addMarker(g,label,count,fn,sizeOverride){if(!map)return;const size=sizeOverride??(count>=200?54:count>=50?47:40);
 const html='<div class="map-bubble '+(count>=200?'high':count===0?'zero':'')+'" style="--size:'+size+'px"><b>'+fmt(count)+'</b><span>'+esc(label)+'</span></div>';
 L.marker([g.lat,g.lng],{title:label+' '+fmt(count)+'件',alt:label+' '+fmt(count)+'件',icon:L.divIcon({className:"case-marker",html,iconSize:[size,size],iconAnchor:[0,0]}),zIndexOffset:count}).on("click",()=>run(fn)).addTo(layer);
}
function clearMap(){layer?.clearLayers();if(rangeCircle){rangeCircle.remove();rangeCircle=null}}
function layoutNationalMarkers(points,width,height){
 const placed=[];
 // Each label uses the closest free callout near its real location.
 // Already-placed labels stay put so the country's geographic order remains clear.
 for(const point of points){
  const margin=point.size/2+5,originX=Math.max(margin,Math.min(width-margin,point.x)),originY=Math.max(margin,Math.min(height-margin,point.y));let found=null;
  for(let i=0;i<10000;i++){
   const radius=3*Math.sqrt(i),angle=i*2.399963229728653,x=originX+Math.cos(angle)*radius,y=originY+Math.sin(angle)*radius;
   if(x<margin||x>width-margin||y<margin||y>height-margin)continue;
   if(placed.every(p=>(p.x-x)**2+(p.y-y)**2>=((p.size+point.size)/2+4)**2)){found={...point,x,y};break;}
  }
  placed.push(found||{...point,x:originX,y:originY});
 }
 return placed;
}
function renderNationalMarkers(){
 if(!map)return;layer.clearLayers();const totals=totalsByPref(),dimensions=map.getSize();
 const points=Object.entries(PREF_CENTERS).map(([pref,p])=>{const count=totals.get(pref)||0,screen=map.latLngToContainerPoint(p);return {pref,p,count,size:count>=200?42:count?36:28,x:screen.x,y:screen.y};}).filter(n=>n.x>=-n.size&&n.x<=dimensions.x+n.size&&n.y>=-n.size&&n.y<=dimensions.y+n.size);
 const labels=layoutNationalMarkers(points,dimensions.x,dimensions.y);
 for(const n of labels){const display=map.containerPointToLatLng([n.x,n.y]),original=map.latLngToContainerPoint(n.p);if(Math.hypot(n.x-original.x,n.y-original.y)>8)L.polyline([n.p,display],{color:'#9aa99e',weight:1,opacity:.7,interactive:false}).addTo(layer);}
 for(const n of labels){const g=map.containerPointToLatLng([n.x,n.y]);addMarker(g,n.pref,n.count,()=>showPref(n.pref),n.size);}
}
function showJapanOutline(){
 if(!map)return;if(baseTiles&&map.hasLayer(baseTiles))map.removeLayer(baseTiles);
 if(japanOutline){japanOutline.addTo(map);return;}
 if(!outlineJob)outlineJob=fetch('assets/japan-outline.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(g=>{japanOutline=L.geoJSON(g,{interactive:false,style:{color:'#819a85',weight:1,fillColor:'#d5e2d2',fillOpacity:1}});if(view.kind==='nation')japanOutline.addTo(map)}).catch(()=>{outlineJob=null;});
}
function showLocalTiles(){if(!map)return;if(japanOutline)japanOutline.remove();if(baseTiles&&!map.hasLayer(baseTiles))baseTiles.addTo(map);}
function drawNation(){clearMap();showJapanOutline();if(map){map.setMinZoom(4);map.fitBounds([[25.5,126.5],[45.5,145.5]],{padding:[28,28],maxZoom:5,animate:false});map.setMinZoom(map.getZoom());}renderNationalMarkers();$("mapHint").textContent="拡大して都道府県を選択";$("cityChoices").replaceChildren()}
function refreshPrefCounts(){
 const totals=totalsByPref(),container=$("prefCounts");container.replaceChildren();
 Object.keys(PREF_CENTERS).forEach(pref=>{const b=document.createElement('button');b.type='button';b.innerHTML='<span>'+esc(pref)+'</span><b>'+fmt(totals.get(pref)||0)+'件</b>';b.onclick=()=>run(()=>showPref(pref));container.append(b)});
 for(const option of $("prefSelect").children)if(option.value)option.textContent=option.value+' '+fmt(totals.get(option.value)||0)+'件';
}
function cityButtons(pref,all=false){
 const entries=[...totalsByCity(pref)].sort((a,b)=>b[1]-a[1]),el=$("cityChoices");el.replaceChildren();
 (all?entries:entries.slice(0,12)).forEach(([k,count])=>{const b=document.createElement("button");b.type="button";b.innerHTML='<span>'+esc(k.split('|')[1])+'</span><b>'+fmt(count)+'件</b>';b.onclick=()=>run(()=>showCity(k));el.append(b)});
 if(entries.length>12&&!all){const b=document.createElement("button");b.type="button";b.className="show-cities";b.textContent="全"+entries.length+"市区町村を表示";b.onclick=()=>cityButtons(pref,true);el.append(b)}
}
async function drawPref(pref,id){
 let rows;try{rows=await ensureGeo(pref)}catch(e){if(id===generation)report(e);return}if(id!==generation)return;
 clearMap();showLocalTiles();const points=[];let missing=0;totalsByCity(pref).forEach((count,k)=>{const city=k.split('|')[1],g=findGeo(rows,city);if(!g){missing+=count;return}points.push([g.lat,g.lng]);addMarker(g,city,count,()=>showCity(k))});
 if(map){if(points.length)map.fitBounds(points,{padding:[35,35],maxZoom:9});else map.setView(PREF_CENTERS[pref],8)}
 $("mapHint").textContent=missing?"位置未登録 "+fmt(missing)+"件も一覧に含みます":"市区町村を選択";
}
function updateListNav(){
 const panel=$("casePanel"),nav=$("stickyListNav");
 if(!panel||!nav||typeof panel.getBoundingClientRect!=="function")return;
 const top=panel.getBoundingClientRect().top;
 nav.hidden=!snapshot||Number(pageTotal)<=0||top<window.innerHeight;
}
if(typeof window!=="undefined"){
 let navFrame=false;
 const scheduleNav=()=>{if(navFrame)return;navFrame=true;requestAnimationFrame(()=>{navFrame=false;updateListNav()})};
 window.addEventListener("scroll",scheduleNav,{passive:true});
 window.addEventListener("resize",scheduleNav,{passive:true});
 if("IntersectionObserver" in window)new IntersectionObserver(scheduleNav).observe($("casePanel"));
}
function setArea(label,count,copy){window.LeadMapExperience?.areaChanged(label,count);$("areaEyebrow").textContent=label+"の対応可能な見込案件";$("areaBig").textContent=fmt(count);$("areaCopy").textContent=copy||"このエリア全体で"+fmt(count)+"件。下の案件一覧で、具体的な工事内容を確認できます。";$("stickyListCount").textContent=fmt(count)+"件";updateListNav()}
function updateURL(){if(IS_DEMO)return;const u=new URL(location.href);["pref","city","r","service","area"].forEach(k=>u.searchParams.delete(k));if(view.pref)u.searchParams.set("pref",view.pref);if(view.city)u.searchParams.set("city",view.city);if(view.kind==="radius")u.searchParams.set("r",view.radius);if(view.kind==="city")u.searchParams.set("area","city");if(service!=="all")u.searchParams.set("service",service);history.replaceState(null,"",u)}
function beginView(next){
 window.LeadMapActivity?.track("area_search",{area:next.label});generation++;contactCases.clear();pageController?.abort();pageLoading=false;view=next;pageCount=0;pageTotal=sumKeys(next.keys);seen=new Set();
 $("searchStatus").textContent="";$("candidates").replaceChildren();$("list").innerHTML='<div class="empty">案件を読み込んでいます…</div>';$("pageStatus").textContent="";$("loadMore").hidden=true;$("list").setAttribute("aria-busy","true");
 $("title").textContent=next.label+"の案件一覧";$("sub").textContent="全"+fmt(pageTotal)+"件・10件ずつ表示";$("prefSelect").value=next.pref||"";$("breadcrumb").textContent=next.label==="全国"?"":"／ "+next.label;setArea(next.label,pageTotal);updateURL();if(typeof syncCaseFilterContext==="function")syncCaseFilterContext();return generation;
}
async function showJapan(){const id=beginView({kind:"nation",label:"全国",keys:null,pref:""});drawNation();await loadPage(id)}
async function showPref(pref){
 $("q").value=pref;const keys=[...totalsByCity(pref).keys()],id=beginView({kind:"pref",label:pref,keys,pref});cityButtons(pref);
 await Promise.all([drawPref(pref,id),loadPage(id)]);
}
async function showCity(k){
 const [pref,city]=k.split('|');$("q").value=pref+city;const id=beginView({kind:"city",label:pref+" "+city,keys:[k],pref,city});cityButtons(pref);
 await Promise.all([drawPref(pref,id),loadPage(id)]);
}
async function loadPage(id=generation){
 if(pageLoading||id!==generation)return;pageLoading=true;const ctrl=new AbortController();pageController=ctrl;$("loadMore").disabled=true;$("list").setAttribute("aria-busy","true");
 try{
  const data=await call({api:"cases",services:service==="all"?"gaiheki,amamori":service,keys:view.keys,limit:PAGE_SIZE,offset:pageCount,snapshot,filters:caseFilters},ctrl.signal);
  if(id!==generation)return;
  if(Number(data.area_total??data.total)!==sumKeys(view.keys))throw new Error("集計の更新を確認しました。上の「更新」で最新データを取得してください。");
  pageTotal=Number(data.total);
  const filtered=Object.keys(caseFilters).length>0;
  $("sub").textContent=filtered?"地域全体"+fmt(sumKeys(view.keys))+"件 ／ 条件に一致"+fmt(pageTotal)+"件・10件ずつ表示":"全"+fmt(pageTotal)+"件・10件ずつ表示";
  if(pageCount===0)$("list").replaceChildren();
  const rows=data.cases||[];if(!rows.length&&pageCount<pageTotal)throw new Error("続きを取得できませんでした。もう一度お試しください。");
  const unique=rows.filter(c=>{const k=c.case_id;if(seen.has(k))return false;seen.add(k);return true});
  $("list").insertAdjacentHTML("beforeend",unique.map((c,i)=>cardHTML(c)+(pageCount+i===2?caseInquiryBreak():"" )).join(""));pageCount+=rows.length;
  if(!pageTotal)$("list").innerHTML='<div class="empty">現在、このエリアの該当案件はありません。<br>絞り込み条件を変えるか、検索範囲を広げてお試しください。</div>';
  $("pageStatus").textContent="全"+fmt(pageTotal)+"件中 "+fmt(seen.size)+"件を表示";$("loadMore").hidden=pageCount>=pageTotal;$("loadMore").textContent="さらに"+Math.min(PAGE_SIZE,pageTotal-pageCount)+"件表示";
 }catch(e){if(id!==generation||e.name==="AbortError")return;
  if(!pageCount)$("list").innerHTML='<div class="empty">'+esc(e.message)+'<br><button type="button" id="retryPage">再読み込み</button></div>';
  else{$("pageStatus").textContent=e.message;$("loadMore").hidden=false;$("loadMore").textContent="続きを再読み込み"}
  $("retryPage")?.addEventListener("click",()=>run(()=>loadPage(id)));
 }finally{if(id===generation){pageLoading=false;$("loadMore").disabled=false;$("list").setAttribute("aria-busy","false")}}
}
const PREF_CENTERS={
"北海道":[43.06,141.35],"青森県":[40.82,140.74],"岩手県":[39.70,141.15],"宮城県":[38.27,140.87],"秋田県":[39.72,140.10],"山形県":[38.24,140.36],"福島県":[37.75,140.47],
"茨城県":[36.34,140.45],"栃木県":[36.57,139.88],"群馬県":[36.39,139.06],"埼玉県":[35.86,139.65],"千葉県":[35.61,140.12],"東京都":[35.68,139.69],"神奈川県":[35.45,139.64],
"新潟県":[37.90,139.02],"富山県":[36.70,137.21],"石川県":[36.59,136.63],"福井県":[36.07,136.22],"山梨県":[35.66,138.57],"長野県":[36.65,138.18],"岐阜県":[35.39,136.72],"静岡県":[34.98,138.38],"愛知県":[35.18,136.91],
"三重県":[34.73,136.51],"滋賀県":[35.00,135.87],"京都府":[35.01,135.77],"大阪府":[34.69,135.50],"兵庫県":[34.69,135.18],"奈良県":[34.69,135.83],"和歌山県":[34.23,135.17],
"鳥取県":[35.50,134.24],"島根県":[35.47,133.05],"岡山県":[34.66,133.93],"広島県":[34.40,132.46],"山口県":[34.19,131.47],
"徳島県":[34.07,134.56],"香川県":[34.34,134.04],"愛媛県":[33.84,132.77],"高知県":[33.56,133.53],
"福岡県":[33.59,130.40],"佐賀県":[33.25,130.30],"長崎県":[32.75,129.87],"熊本県":[32.79,130.74],"大分県":[33.24,131.61],"宮崎県":[31.91,131.42],"鹿児島県":[31.56,130.56],"沖縄県":[26.21,127.68]
};

function humanLabel(k){
  return ({building_type:"建物種別",consideration_level:"検討状況",symptoms:"症状",story:"階数",age_of_building:"築年数",chat_item:"ご相談内容"})[k]||k;
}
function valueText(v){
  if(v==null||v==="")return"";
  if(Array.isArray(v))return v.map(valueText).filter(Boolean).join(" / ");
  if(typeof v==="object")return Object.entries(v).map(([k,x])=>humanLabel(k)+"："+valueText(x)).join(" / ");
  return String(v);
}
function chatOf(c){
  const d=c.detail||{};
  return d.chat_item&&typeof d.chat_item==="object"&&!Array.isArray(d.chat_item)?d.chat_item:{};
}
function pick(obj,labels){
  for(const k of labels){if(obj[k]!=null&&obj[k]!=="")return String(obj[k])}
  return "";
}
function infoBox(label,value){
  if(!value)return"";
  return '<div class="info-box"><div class="info-label">'+esc(label)+'</div><div class="info-value">'+esc(value)+'</div></div>';
}
function isIssueValue(v){
  const t=String(v||"").trim();
  if(!t)return false;
  return !/^(全くない|ない|なし|いいえ|わからない|不明|特になし)$/.test(t);
}
function gaihekiBody(c){
  const q=chatOf(c);
  const priority=[
    ["建物",pick(q,["物件の種類は？","一戸建てですか？"])],
    ["階数",pick(q,["何回建てでしょうか？"])],
    ["築年数",pick(q,["築年数は？"])],
    ["延べ床面積",pick(q,["延べ床面積は、おおよそどのくらいでしょうか？"])],
    ["工事予定",pick(q,["工事の予定はいつになりますか？"])],
    ["見積取得",pick(q,["すでに見積もりはお持ちですか？"])],
    ["外壁材",pick(q,["外壁材は？"])],
    ["屋根材",pick(q,["お住まいの屋根材はどちらになりますか？"])]
  ].filter(x=>x[1]);

  const issueKeys=[
    "チョーキングはありますか？","外壁にはがれはありますか？","ヘアークラックはありますか？",
    "外壁にカビや苔はありますか？","外壁に色あせはみられますか？","屋根にカビや苔はありますか？",
    "屋根の色がくすんでいませんか？","雨漏りや漏水の症状はありますか？","内壁にカビ・雨漏りはありますか？",
    "屋根材にひび割れや欠けはありますか？"
  ];
  const issues=issueKeys.filter(k=>isIssueValue(q[k])).map(k=>{
    const short=k.replace("はありますか？","").replace("はみられますか？","").replace("いませんか？","");
    return short+"："+q[k];
  });

  const used=new Set([
    "物件の種類は？","一戸建てですか？","何回建てでしょうか？","築年数は？",
    "延べ床面積は、おおよそどのくらいでしょうか？","工事の予定はいつになりますか？",
    "すでに見積もりはお持ちですか？","外壁材は？","お住まいの屋根材はどちらになりますか？",
    ...issueKeys,"物件の地域は？"
  ]);
  const rest=Object.entries(q).filter(([k,v])=>!used.has(k)&&valueText(v));

  let h='';
  if(c.items&&c.items!=="null")h+='<div class="work-title">'+esc(valueText(c.items))+'</div>';
  if(priority.length)h+='<div class="section-title">案件概要</div><div class="info-grid">'+priority.map(x=>infoBox(x[0],x[1])).join("")+'</div>';
  if(issues.length)h+='<div class="section-title">気になる症状</div><div class="alerts">'+issues.map(x=>'<span class="alert-chip">'+esc(x)+'</span>').join("")+'</div>';
  if(rest.length)h+='<details class="more"><summary>その他の物件情報（'+rest.length+'項目）</summary><div class="more-grid">'+rest.map(([k,v])=>'<div class="more-row"><div class="more-key">'+esc(k)+'</div><div class="more-value">'+esc(valueText(v))+'</div></div>').join("")+'</div></details>';
  return h;
}
function amamoriBody(c){
  const d=c.detail||{};
  const rows=[
    ["建物種別",valueText(d.building_type)],
    ["検討状況",valueText(d.consideration_level)],
    ["症状",valueText(d.symptoms)]
  ].filter(x=>x[1]);
  let h='';
  if(c.items&&c.items!=="null")h+='<div class="work-title">'+esc(valueText(c.items))+'</div>';
  if(rows.length)h+='<div class="section-title">案件内容</div><div class="amamori-box">'+rows.map(x=>'<div class="amamori-row"><div class="amamori-key">'+esc(x[0])+'</div><div class="amamori-value">'+esc(x[1])+'</div></div>').join("")+'</div>';
  return h;
}
function caseBody(c){return c.service_code==="amamori"?amamoriBody(c):gaihekiBody(c)}
function responseMail(c,type){
  const subject=type==="対応"?"【案件対応希望】"+c.pref+" "+c.city+" / "+serviceLabel(c.service_code):"【案件相談希望】"+c.pref+" "+c.city;
  const body=[
    "案件について"+(type==="対応"?"対応を希望します。":"詳しく話を聞きたいです。"),
    "",
    "案件ID："+(c.case_id||""),
    "種別："+serviceLabel(c.service_code),
    "エリア："+c.pref+" "+c.city,
    "住所："+(c.address||""),
    "申込日時："+(c.inquired_at||c.received_at||"")
  ].join("\n");
  return "mailto:"+CONTACT_EMAIL+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
}
function isNewCase(c){const d=new Date(c.effective_at||c.inquired_at||c.received_at);const age=new Date(snapshot||Date.now()).getTime()-d.getTime();return Number.isFinite(age)&&age>=0&&age<=3*86400000}
function consultLink(c){return /^https:\/\//.test(CALENDAR_URL)?CALENDAR_URL:responseMail(c,"相談")}
function privateCaseFacts(c){
 const q=chatOf(c),d=c.detail||{};
 return [['建物',d.building_type||pick(q,['物件の種類は？','一戸建てですか？'])],['築年数',d.age_of_building||q['築年数は？']],['階数',d.story||q['何回建てでしょうか？']],['工事予定',q['工事の予定はいつになりますか？']],['延べ床面積',q['延べ床面積は、おおよそどのくらいでしょうか？']],['見積取得',q['すでに見積もりはお持ちですか？']],['外壁材',q['外壁材は？']],['屋根材',q['お住まいの屋根材はどちらになりますか？']],['検討状況',d.consideration_level]].filter(x=>x[1]).map(([label,value])=>({label,value:valueText(value)}));
}
function cardHTML(c){
 contactCases.set(String(c.case_id),{case_id:String(c.case_id),pref:c.pref,city:c.city,service_code:c.service_code});
 const facts=c.public_preview?(c.public_facts||[]):privateCaseFacts(c),get=label=>facts.find(f=>f.label===label)?.value||'—';
 const work=c.public_work||valueText(c.items)||(c.service_code==='amamori'?'雨漏りのご相談':'外壁工事のご相談');
 const address=c.public_preview?c.display_address:c.address,phone=c.masked_phone||'',id='lead-details-'+encodeURIComponent(c.case_id);
 const check=c.needs_status_check||get('工事予定')==='すでに施工済み',action=check?'conditions':'respond',cta=check?'最新の状況を確認する':'この案件に対応したい';
 const symptom=c.public_symptoms||[],other=c.public_other||[];
 const meta='<span class="lead-category">'+serviceLabel(c.service_code)+'</span>'+(isNewCase(c)?'<span class="lead-new">新着</span>':'')+(check?'<span class="lead-review">状況の確認が必要</span>':'');
 const detailFacts=facts.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(f.value)+'</dd></div>').join('');
 return '<article class="card lead-record '+(c.public_preview?'public-card':'')+'"><div class="lead-overview"><div class="lead-location"><div class="lead-tags">'+meta+'</div><h3>'+esc(c.pref)+' '+esc(c.city)+'</h3><p>'+esc(dateText(c.effective_at||c.inquired_at||c.received_at))+' 受付</p></div><div class="lead-request"><h4>'+esc(work)+'</h4><p class="lead-street">'+esc(address||[c.pref,c.city].join(' '))+'</p><dl class="lead-quick-facts">'+['建物','築年数','工事予定'].map(label=>'<div><dt>'+label+'</dt><dd>'+esc(get(label))+'</dd></div>').join('')+'</dl></div><div class="lead-decision"><button type="button" class="lead-detail-toggle" data-case-toggle="'+esc(c.case_id)+'" aria-expanded="false" aria-controls="'+esc(id)+'">案件の詳細を見る <span aria-hidden="true">＋</span></button><button type="button" class="lead-interest" data-contact-action="'+action+'" data-contact-id="'+esc(c.case_id)+'">'+cta+' <span aria-hidden="true">→</span></button></div></div><section id="'+esc(id)+'" class="lead-record-body" hidden aria-label="'+esc(c.pref+' '+c.city)+'の案件詳細"><div class="lead-detail-heading"><h4>受付時のご相談内容</h4><span>案件ID：'+esc(c.case_id)+'</span></div>'+(check?'<p class="lead-status-note">受付情報に「すでに施工済み」の回答があります。最新の状況を担当者へご確認ください。</p>':'')+'<div class="lead-detail-layout"><div class="lead-contact-data"><dl><dt>所在地</dt><dd>'+esc(address||[c.pref,c.city].join(' '))+'</dd></dl><small>'+(c.public_preview?'番地・建物名は非公開':'閲覧用URLの表示情報')+'</small><dl><dt>電話番号 <span>下4桁非表示</span></dt><dd class="lead-masked-phone">'+esc(phone||'連絡先の掲載なし')+'</dd></dl>'+(!c.public_preview&&c.customer_surname?'<p>'+esc(c.customer_surname)+'様</p>':'')+'</div><div><dl class="lead-detail-facts">'+detailFacts+'</dl>'+(symptom.length?'<div class="lead-symptoms"><h5>気になる症状</h5>'+symptom.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div>':'')+(other.length?'<details class="lead-other"><summary>その他の物件情報（'+other.length+'項目）</summary><dl>'+other.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(f.value)+'</dd></div>').join('')+'</dl></details>':'')+(!c.public_preview?'<details class="lead-other"><summary>受付情報をさらに確認する</summary>'+caseBody(c)+'</details>':'')+'</div></div><div class="lead-detail-next"><div><strong>対応できそうな案件が見つかったら</strong><p>紹介可否・費用・進め方を担当者に確認できます。送信だけで購入は確定しません。</p></div><button type="button" data-contact-action="conditions" data-contact-id="'+esc(c.case_id)+'">この案件の条件を聞く →</button></div></section></article>';
}
function caseInquiryBreak(){return '<aside class="case-inquiry-break"><div><span>地域の案件に、対応できそうだと感じたら。</span><p>ご紹介できる案件と費用を、担当者に先に確認できます。</p></div><button type="button" data-contact-action="conditions">このエリアの紹介条件を確認 →</button></aside>';}
$('list').addEventListener('click',e=>{
 const button=e.target.closest?.('[data-case-toggle]');if(!button)return;const record=button.closest('.lead-record'),panel=record.querySelector('.lead-record-body'),open=button.getAttribute('aria-expanded')!=='true';panel.hidden=!open;button.setAttribute('aria-expanded',String(open));button.innerHTML=open?'詳細を閉じる <span aria-hidden="true">−</span>':'案件の詳細を見る <span aria-hidden="true">＋</span>';
 if(open)window.LeadMapActivity?.track('button_click',{action:'other_details',case_id:button.dataset.caseToggle,field:'case_details'});
 updateListNav();
});
function nearestBox(center,b){return {lat:Math.max(b[0],Math.min(b[2],center.lat)),lng:Math.max(b[1],Math.min(b[3],center.lng))}}
async function showRadius(pref,city,radius){
 const action=++generation;setSearchBusy(true);$("searchStatus").textContent="";
 try{
  const [rows,index]=await Promise.all([ensureGeo(pref),ensureIndex()]);if(action!==generation)return;
  const center=findGeo(rows,city);if(!center)throw new Error("この市区町村の位置情報が見つかりません。都道府県で検索してください。");
  const nearby=index.prefs.filter(p=>hav(center,nearestBox(center,p.bounds))<=radius);
  const sets=await Promise.all(nearby.map(p=>ensureGeo(p.pref)));if(action!==generation)return;
  const totals=totalsByCity(),selected=new Map();
  // Match each DB municipality once, even where the coordinate source has aliases.
  for(const [k,count] of totals){const [p,c]=k.split('|'),set=sets.find(a=>a[0]?.pref===p);if(!set)continue;const g=findGeo(set,c);if(g&&hav(center,g)<=radius)selected.set(k,{g,count})}
  const keys=[...selected.keys()],label=pref+' '+city+'から'+radius+'km圏内';
  $("q").value=pref+city;const id=beginView({kind:"radius",label,keys,pref,city,radius});clearMap();showLocalTiles();$("cityChoices").replaceChildren();
  selected.forEach(({g,count},k)=>addMarker(g,k.split('|')[1],count,()=>showCity(k)));
  if(map){rangeCircle=L.circle([center.lat,center.lng],{radius:radius*1000,color:'#476e62',weight:1,fillOpacity:.04,interactive:false}).addTo(map);map.fitBounds(rangeCircle.getBounds(),{padding:[28,28],maxZoom:10})}
  $("mapHint").textContent=selected.size+'市区町村を合計';await loadPage(id);
 }finally{if(action<=generation)setSearchBusy(false)}
}
function findCandidates(index,query){
 const q=norm(query),all=index.prefs.flatMap(p=>p.cities.map(city=>({pref:p.pref,city}))),pref=Object.keys(PREF_CENTERS).find(p=>q.startsWith(p));
 const qualified=all.filter(g=>!pref||g.pref===pref),term=pref?q.slice(pref.length):q;
 let found=qualified.filter(g=>g.city===term||noCounty(g.city)===term);
 if(!found.length)found=qualified.filter(g=>g.city.includes(term));
 return found;
}
async function search(){
 const q=norm($("q").value);$("candidates").replaceChildren();$("searchStatus").textContent="";
 if(!snapshot)throw new Error("案件データの読み込み後に検索してください。");
 if(!q){await showJapan();return}
 const pref=Object.keys(PREF_CENTERS).find(p=>norm(p)===q||norm(p.replace(/[都道府県]$/, ""))===q);
 setSearchBusy(true);
 try{
  if(pref){await showPref(pref)}else{
   const index=await ensureIndex(),candidates=findCandidates(index,q);
   if(!candidates.length)throw new Error("市区町村が見つかりません。都道府県名または市区町村名を入力してください。");
   if(candidates.length>1){
    $("searchStatus").textContent="候補の地域を選択してください。";
    candidates.slice(0,30).forEach(c=>{const b=document.createElement('button');b.type='button';b.textContent=c.pref+' '+c.city;b.onclick=()=>run(()=>showRadius(c.pref,c.city,Number($("radius").value)));$("candidates").append(b)});
    if(candidates.length>30)$("searchStatus").textContent="候補が多数あります。都道府県や区名まで入力してください。";
    return;
   }
   const c=candidates[0];await showRadius(c.pref,c.city,Number($("radius").value));
  }
  $("areaSummary").scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 }finally{setSearchBusy(false)}
}
async function rerender(){if(!snapshot)return;refreshPrefCounts();const v={...view};if(v.kind==='nation')await showJapan();else if(v.kind==='pref')await showPref(v.pref);else if(v.kind==='city')await showCity(key(v.pref,v.city));else await showRadius(v.pref,v.city,Number($("radius").value))}
async function bootstrap(){
 $("refresh").disabled=true;setSearchBusy(true);$("searchStatus").textContent="";
 try{
  const data=await call({api:'bootstrap'});summaries=data.rows||[];snapshot=data.snapshot;
  const total=summaries.reduce((n,x)=>n+Number(x.case_count),0);if(total!==Number(data.metrics.total))throw new Error("案件集計を確認できませんでした。再度更新してください。");
  $("prospectTotal").textContent=fmt(total);$("todayCount").textContent=fmt(data.metrics.today);$("last7Count").textContent=fmt(data.metrics.last7);
  for(const [id,s] of [['outer','gaiheki'],['rain','amamori']])$(id).textContent=fmt(summaries.filter(x=>x.service_code===s).reduce((n,x)=>n+Number(x.case_count),0));
  $("updatedAt").textContent=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(snapshot))+' 更新';
  await rerender();window.LeadMapExperience?.ready?.();
 }catch(e){
  report(e);$("updatedAt").textContent=snapshot?'更新できませんでした（前回取得分を表示）':'取得できませんでした';
  if(!snapshot){$("list").innerHTML='<div class="empty">'+esc(e.message)+'</div>';$("list").setAttribute('aria-busy','false');$("sub").textContent='通信状況を確認し、もう一度更新してください'}
 }finally{$("refresh").disabled=false;setSearchBusy(false)}
}
$("searchForm").addEventListener('submit',e=>{e.preventDefault();run(search)});
$("service").onchange=function(){service=this.value;run(rerender)};
$("radius").onchange=()=>{if(view.kind==='radius')run(rerender)};
$("japan").onclick=()=>{if(snapshot){$("q").value='';run(showJapan)}};
$("prefSelect").onchange=function(){if(snapshot)run(()=>this.value?showPref(this.value):showJapan())};
$("loadMore").onclick=()=>run(()=>loadPage());
$("refresh").onclick=()=>run(bootstrap);
Object.keys(PREF_CENTERS).forEach(pref=>{const o=document.createElement('option');o.value=pref;o.textContent=pref;$("prefSelect").append(o)});

if(['gaiheki','amamori'].includes(params.get('service'))){service=params.get('service');$("service").value=service}
const initialPref=params.get('pref'),initialCity=params.get('city');
if(Object.hasOwn(PREF_CENTERS,initialPref)){
 if(initialCity)view={kind:params.get('area')==='city'?'city':'radius',label:'',keys:[],pref:initialPref,city:norm(initialCity),radius:params.get('r')==='40'?40:20};
 else view={kind:'pref',label:initialPref,keys:[],pref:initialPref};
 $("radius").value=String(view.radius||20);
}
initMap();
run(bootstrap);
