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
 const headerNames={会社名:'company_name',企業名:'company_name',company:'company_name',company_name:'company_name',メール:'recipient_email',メールアドレス:'recipient_email',email:'recipient_email',recipient_email:'recipient_email',会社ID:'external_ref',電話番号:'external_ref','会社ID・電話番号':'external_ref',管理ID:'external_ref',MF会社ID:'external_ref',external_ref:'external_ref'};
 let fields=['company_name','recipient_email','external_ref'];
 if(rows.length&&headerNames[rows[0][0]]==='company_name'&&rows[0].length>=2&&rows[0].length<=3&&rows[0].every(x=>headerNames[x])){fields=rows.shift().map(x=>headerNames[x]);if(new Set(fields).size!==fields.length)throw Error('列名が重複しています。');}
 if(!rows.length)throw Error('会社名と、メールまたは会社ID・電話番号を入力してください。');
 return rows.map((r,i)=>{
  if(r.length<2||r.length>3||r.length>fields.length)throw Error((i+1)+'行目の列数をご確認ください。');
  const entry={company_name:'',recipient_email:'',external_ref:''};r.forEach((v,j)=>entry[fields[j]]=v);
  entry.recipient_email=entry.recipient_email.toLowerCase();entry.external_ref=entry.external_ref.normalize('NFKC').trim();
  const digits=entry.external_ref.replace(/[\s()-]/g,'').replace(/^\+81/,'0');if(/^[+\d\s()-]+$/.test(entry.external_ref)&&/^0[1-9][0-9]{8,9}$/.test(digits))entry.external_ref=digits;
  if(!entry.company_name||entry.company_name.length>120||/[\u0000-\u001f]/.test(entry.company_name)||entry.recipient_email.length>254||(entry.recipient_email&&!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(entry.recipient_email))||entry.external_ref.length>120||/[\u0000-\u001f]/.test(entry.external_ref)||(!entry.recipient_email&&!entry.external_ref))throw Error((i+1)+'行目をご確認ください。メールがない場合は会社IDまたは電話番号が必要です。');
  return entry;
 });
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
 el('companyLinksPreview').innerHTML=generatedCompanies.slice(0,10).map((r,index)=>{let url='閲覧URLを入力すると表示されます';try{url=buildCompanyURL(base,r.code)}catch{}return '<tr><td>'+esc(r.company_name)+'</td><td>'+esc(r.recipient_email||'メールなし')+(r.external_ref?'<small>会社ID・電話：'+esc(r.external_ref)+'</small>':'')+'</td><td><code>'+esc(url)+'</code><button type="button" data-copy-company="'+index+'">URLをコピー</button></td></tr>';}).join('')||empty(3);
}
function renderCompanyActivity(r){
 el('companySummary').textContent='会社別URLでアクセス '+Number(r.identified_companies||0)+'送付先 ／ ボタン操作あり '+Number(r.engaged_companies||0)+'送付先 ／ 登録済み '+Number(r.registered_companies||0)+'送付先';
 el('companyActivity').innerHTML=(r.company_activity||[]).map(x=>'<tr><td>'+esc(x.company_name)+'<small>'+esc(x.recipient_email||x.external_ref||'メールなし')+'</small></td><td>'+stamp(x.last_seen)+'</td><td>'+esc(x.visits)+'</td><td>'+duration(x.active_ms)+'</td><td>'+esc(x.clicks)+(Number(x.clicks)>0?'<small class="status-ok">ボタン操作あり</small>':'')+'</td><td>'+esc(x.conversions)+'</td></tr>').join('')||empty(6);
}
el('companyFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>10000000)throw Error('CSVは10MB以下にしてください。');el('companyRows').value=await f.text();el('companyLinkStatus').textContent='CSVを読み込みました。会社名とメールまたは会社ID・電話番号を確認して発行してください。';}catch(e){el('companyLinkStatus').textContent=e.message;}});
el('companyBaseURL').addEventListener('input',renderGeneratedCompanies);
el('companyLinkForm').addEventListener('submit',async e=>{
 e.preventDefault();const status=el('companyLinkStatus');el('generateCompanyLinks').disabled=true;generatedCompanies=[];renderGeneratedCompanies();
 try{
  const rows=parseCompanyList(el('companyRows').value);
  for(let offset=0;offset<rows.length;offset+=200){status.textContent='会社別URLを発行しています… '+offset.toLocaleString('ja-JP')+' / '+rows.length.toLocaleString('ja-JP');const r=await api({api:'admin_import_companies',rows:rows.slice(offset,offset+200)});generatedCompanies.push(...r.rows);}
  renderGeneratedCompanies();status.textContent=generatedCompanies.length.toLocaleString('ja-JP')+'件の識別IDを発行しました。閲覧URLを入力してCSVをダウンロードし、メール・SMS・LINEなどで各社へ共有してください。同じ会社名とメール（メールなしは会社ID・電話番号）で再登録すると同じIDを使います。';
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
  const withRef=generatedCompanies.some(r=>r.external_ref);
  const rows=[['会社名','メールアドレス','案件エリアマップURL',...(withRef?['会社ID・電話番号']:[])],...generatedCompanies.map(r=>[r.company_name,r.recipient_email,buildCompanyURL(base,r.code),...(withRef?[r.external_ref||'']:[])])];
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='company-map-links.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  el('companyLinkStatus').textContent='CSVを作成しました。メール本文のリンクに「案件エリアマップURL」列を差し込んでください。メール送信はこの画面では行いません。';
 }catch(e){el('companyLinkStatus').textContent=e.message;}
});

el('companyLinksPreview').addEventListener('click',async e=>{
 const button=e.target.closest('[data-copy-company]');if(!button)return;
 try{const row=generatedCompanies[Number(button.dataset.copyCompany)];if(!row)throw Error('会社を確認してください。');await navigator.clipboard.writeText(buildCompanyURL(el('companyBaseURL').value.trim(),row.code));el('companyLinkStatus').textContent=row.company_name+'の専用URLをコピーしました。SMS・LINEなどでこの会社へ共有してください。';}catch(e){el('companyLinkStatus').textContent=e.message||'URLをコピーできませんでした。表示されたURLを選択してコピーしてください。';}
});
