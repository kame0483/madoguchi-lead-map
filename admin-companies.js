"use strict";
let generatedCompanies=[];
function parseCompanyList(source){
 const text=String(source).replace(/^\uFEFF/,'');let quoted=false,delimiter=',';
 for(let i=0;i<text.length;i++){if(text[i]==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted){if(text[i]==='\t'){delimiter='\t';break;}if(/[\r\n]/.test(text[i]))break;}}
 const rows=[];let row=[],field='',inside=false;
 for(let i=0;i<=text.length;i++){
  const ch=text[i];
  if(inside){if(ch===undefined)throw Error('CSVの引用符が閉じていません。');if(ch==='"'){if(text[i+1]==='"'){field+='"';i++;}else inside=false;}else field+=ch;continue;}
  if(ch==='"'&&field===''){inside=true;continue;}
  if(ch===delimiter||ch==='\n'||ch==='\r'||ch===undefined){row.push(field.trim());field='';if(ch!==delimiter){if(row.some(Boolean))rows.push(row);row=[];if(ch==='\r'&&text[i+1]==='\n')i++;}}else field+=ch;
 }
 if(rows.length&&/^(会社名|企業名|company|company_name)$/i.test(rows[0][0])&&/^(メールアドレス|メール|email|recipient_email)$/i.test(rows[0][1]))rows.shift();
 if(!rows.length)throw Error('会社名とメールアドレスの2列を貼り付けてください。');
 return rows.map((r,i)=>{if(r.length!==2||!r[0]||r[0].length>120||/[\u0000-\u001f]/.test(r[0])||r[1].length>254||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(r[1]))throw Error((i+1)+'行目をご確認ください。会社名とメールアドレスの2列が必要です。');return {company_name:r[0],recipient_email:r[1].toLowerCase()};});
}
function buildCompanyURL(base,code){
 let u;try{u=new URL(base)}catch{throw Error('現在お使いの、案件が表示できる閲覧URLを入力してください。');}
 if(u.protocol!=='https:'||u.host!=='kame0483.github.io'||!/^\/madoguchi-lead-map\/(index\.html)?$/.test(u.pathname)||u.username||u.password||!u.searchParams.get('k')||!/^[0-9a-f]{32}$/.test(code))throw Error('閲覧キー付きの案件エリアマップURLを入力してください。管理画面のURLは使用できません。');
 const allowed=['k','pref','city','r','service','area'];for(const k of [...u.searchParams.keys()])if(!allowed.includes(k))u.searchParams.delete(k);
 u.hash='';u.searchParams.set('company',code);return u.href;
}
function renderGeneratedCompanies(){
 el('downloadCompanyLinks').disabled=!generatedCompanies.length;
 const base=el('companyBaseURL').value.trim();
 el('companyLinksPreview').innerHTML=generatedCompanies.slice(0,10).map(r=>{let url='閲覧URLを入力すると表示されます';try{url=buildCompanyURL(base,r.code)}catch{}return '<tr><td>'+esc(r.company_name)+'</td><td>'+esc(r.recipient_email)+'</td><td><code>'+esc(url)+'</code></td></tr>';}).join('')||empty(3);
}
function renderCompanyActivity(r){
 el('companySummary').textContent='会社別URLでアクセス '+Number(r.identified_companies||0)+'送付先 ／ ボタン操作あり '+Number(r.engaged_companies||0)+'送付先 ／ 登録済み '+Number(r.registered_companies||0)+'送付先';
 el('companyActivity').innerHTML=(r.company_activity||[]).map(x=>'<tr><td>'+esc(x.company_name)+'<small>'+esc(x.recipient_email)+'</small></td><td>'+stamp(x.last_seen)+'</td><td>'+esc(x.visits)+'</td><td>'+duration(x.active_ms)+'</td><td>'+esc(x.clicks)+(Number(x.clicks)>0?'<small class="status-ok">ボタン操作あり</small>':'')+'</td><td>'+esc(x.conversions)+'</td></tr>').join('')||empty(6);
}
el('companyFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>10000000)throw Error('CSVは10MB以下にしてください。');el('companyRows').value=await f.text();el('companyLinkStatus').textContent='CSVを読み込みました。会社名・メールアドレスの列を確認して発行してください。';}catch(e){el('companyLinkStatus').textContent=e.message;}});
el('companyBaseURL').addEventListener('input',renderGeneratedCompanies);
el('companyLinkForm').addEventListener('submit',async e=>{
 e.preventDefault();const status=el('companyLinkStatus');el('generateCompanyLinks').disabled=true;generatedCompanies=[];renderGeneratedCompanies();
 try{
  const rows=parseCompanyList(el('companyRows').value);
  for(let offset=0;offset<rows.length;offset+=200){status.textContent='会社別URLを発行しています… '+offset.toLocaleString('ja-JP')+' / '+rows.length.toLocaleString('ja-JP');const r=await api({api:'admin_import_companies',rows:rows.slice(offset,offset+200)});generatedCompanies.push(...r.rows);}
  renderGeneratedCompanies();status.textContent=generatedCompanies.length.toLocaleString('ja-JP')+'件の識別IDを発行しました。閲覧URLを入力してCSVをダウンロードし、一斉メールのリンク欄に差し込んでください。同じ会社名・メールアドレスの再取り込みでは、同じIDを使用します。';
 }catch(e){renderGeneratedCompanies();status.textContent=e.message+(generatedCompanies.length?' 途中までの登録は保存されています。再実行しても同じ送付先は重複登録されません。':'');}finally{el('generateCompanyLinks').disabled=false;}
});
el('loadCompanyLinks').addEventListener('click',async()=>{el('loadCompanyLinks').disabled=true;generatedCompanies=[];try{let total=1;while(generatedCompanies.length<total){const r=await api({api:'admin_companies',offset:generatedCompanies.length});total=Number(r.total);if(!r.rows.length)break;generatedCompanies.push(...r.rows);el('companyLinkStatus').textContent=generatedCompanies.length+' / '+total+'件を読み込みました。';}renderGeneratedCompanies();el('companyLinkStatus').textContent='登録済み '+generatedCompanies.length.toLocaleString('ja-JP')+'件を読み込みました。';}catch(e){el('companyLinkStatus').textContent=e.message;}finally{el('loadCompanyLinks').disabled=false;}});
el('downloadCompanyLinks').addEventListener('click',()=>{
 try{
  if(!generatedCompanies.length)throw Error('先に会社別URLを発行してください。');
  const base=el('companyBaseURL').value.trim();
  if(generatedCompanies.some(r=>/^[=+@-]/.test(r.recipient_email)))throw Error('記号から始まるメールアドレスが含まれています。アドレスを変更せず安全に出力するため、元のシートへURL列だけ転記してください。');
  // Prefix spreadsheet-formula-leading cells when exporting CSV.
  const cell=v=>'"'+String(/^[\s]*[=+@-]/.test(String(v))?"'"+v:v).replace(/"/g,'""')+'"';
  const rows=[['会社名','メールアドレス','案件エリアマップURL'],...generatedCompanies.map(r=>[r.company_name,r.recipient_email,buildCompanyURL(base,r.code)])];
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='company-map-links.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  el('companyLinkStatus').textContent='CSVを作成しました。メール本文のリンクに「案件エリアマップURL」列を差し込んでください。メール送信はこの画面では行いません。';
 }catch(e){el('companyLinkStatus').textContent=e.message;}
});
