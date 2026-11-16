"use strict";
let generatedCompanies=[],issuedPage=0,issuerBusy=false;
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

function singleCompanyEntry(name,type,value){
 const company=String(name).trim(),contact=String(value).normalize('NFKC').trim();
 if(!company)throw Error('会社名を入力してください。');
 if(!contact)throw Error(({phone:'電話番号',email:'メールアドレス',ref:'会社ID'})[type]+'を入力してください。');
 if(!['phone','email','ref'].includes(type))throw Error('識別に使う情報を選んでください。');
 if(type==='phone'&&!/^0[1-9][0-9]{8,9}$/.test(contact.replace(/[\s()-]/g,'').replace(/^\+81/,'0')))throw Error('電話番号は市外局番から10〜11桁で入力してください。');
 const quote=x=>'"'+x.replace(/"/g,'""')+'"';
 return parseCompanyList('会社名,'+(type==='email'?'メールアドレス':'会社ID')+'\n'+quote(company)+','+quote(contact))[0];
}
function companyResultPage(rows,query,page){
 const norm=x=>String(x||'').normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s()－ー-]/g,'');
 const term=norm(query),matches=rows.map((row,index)=>({row,index})).filter(({row})=>!term||[row.company_name,row.recipient_email,row.external_ref].some(x=>norm(x).includes(term)));
 const last=Math.max(0,Math.ceil(matches.length/10)-1),current=Math.max(0,Math.min(last,page));
 return {rows:matches.slice(current*10,current*10+10),total:matches.length,page:current,last};
}
function requireBaseURL(){return buildCompanyURL(el('companyBaseURL').value.trim(),'a'.repeat(32));}
function baseURLState(){
 const node=el('baseURLStatus');
 if(!el('companyBaseURL').value.trim()){node.textContent='';node.className='';return false;}
 try{requireBaseURL();node.textContent='閲覧URLを確認しました';node.className='status-ok';return true;}
 catch(e){node.textContent=e.message;node.className='status-warn';return false;}
}
function renderGeneratedCompanies(){
 const base=el('companyBaseURL').value.trim();let valid=false;try{requireBaseURL();valid=true;}catch{}
 el('downloadCompanyLinks').disabled=!generatedCompanies.length||!valid||issuerBusy;
 el('issuedEmpty').hidden=!!generatedCompanies.length;el('issuedContent').hidden=!generatedCompanies.length;
 const result=companyResultPage(generatedCompanies,el('companyResultSearch').value,issuedPage);issuedPage=result.page;
 el('issuedSummary').textContent=el('companyResultSearch').value.trim()?'検索結果 '+result.total.toLocaleString('ja-JP')+'社 ／ 全'+generatedCompanies.length.toLocaleString('ja-JP')+'社':'発行済み '+generatedCompanies.length.toLocaleString('ja-JP')+'社';
 el('companyLinksPreview').innerHTML=result.rows.map(({row:r,index})=>{
  const url=valid?buildCompanyURL(base,r.code):'上の閲覧URLを入力すると、共有用URLを表示できます。';
  const details=[r.recipient_email,r.external_ref].filter(Boolean).join(' ／ ');
  return '<article class="issued-company"><div class="issued-company-heading"><div><h4>'+esc(r.company_name)+'</h4><p>'+esc(details)+'</p></div><button type="button" data-copy-company="'+index+'"'+(!valid?' disabled':'')+'>URLをコピー</button></div><code>'+esc(url)+'</code></article>';
 }).join('')||'<p class="issuer-no-results">一致する会社がありません。会社名や電話番号を変えて検索してください。</p>';
 el('issuedPrevious').disabled=!issuedPage;el('issuedNext').disabled=issuedPage>=result.last;
 el('issuedPagination').hidden=result.total<=10;
 el('issuedPageStatus').textContent=result.total?(issuedPage*10+1)+'–'+Math.min((issuedPage+1)*10,result.total)+' / '+result.total.toLocaleString('ja-JP')+'社':'0社';
}
function issuerStatus(message,error=false,target='companyLinkStatus'){
 const n=el(target);n.textContent=message;n.className='issuer-form-status '+(error?'status-warn':'status-ok');
}
function issuerLoading(busy){
 issuerBusy=busy;for(const id of ['generateSingleCompany','generateCompanyLinks','reloadCompanyLinks','loadCompanyLinks'])el(id).disabled=busy;
 el('generateSingleCompany').textContent=busy?'処理中…':'専用URLを発行する →';
 el('generateCompanyLinks').textContent=busy?'処理中…':'一覧からURLを発行する →';
 el('companyResults').setAttribute('aria-busy',String(busy));renderGeneratedCompanies();
}
function receiveCompanies(rows){generatedCompanies=rows;issuedPage=0;el('companyResultSearch').value='';renderGeneratedCompanies();}
function selectIssuerMode(mode){
 for(const [id,value] of [['issuerSingle','single'],['issuerBulk','bulk'],['issuerRegistered','registered']])el(id).hidden=mode!==value;
 document.querySelectorAll('[data-issuer-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.issuerMode===mode)));
 el('companyLinkStatus').textContent='';
}
function updateSingleContact(){
 const type=el('singleCompanyType').value,n=el('singleCompanyContact');
 const cfg={phone:['電話番号','tel','例：090-1234-5678','メールアドレスは不要です。会社の電話番号を入力してください。'],email:['メールアドレス','email','例：contact@example.com','会社のメールアドレスを入力してください。'],ref:['会社ID','text','例：MF-000123','MFなどで管理している、会社固有のIDを入力してください。']}[type];
 el('singleContactLabel').innerHTML=cfg[0]+' <span>必須</span>';n.type=cfg[1];n.placeholder=cfg[2];n.value='';n.maxLength=type==='email'?254:120;el('singleContactHint').textContent=cfg[3];el('singleCompanyStatus').textContent='';
}
function renderCompanyActivity(r){
 el('companySummary').textContent='会社別URLでアクセス '+Number(r.identified_companies||0)+'送付先 ／ ボタン操作あり '+Number(r.engaged_companies||0)+'送付先 ／ 登録済み '+Number(r.registered_companies||0)+'送付先';
 el('companyActivity').innerHTML=(r.company_activity||[]).map(x=>'<tr><td>'+esc(x.company_name)+'<small>'+esc(x.recipient_email||x.external_ref||'メールなし')+'</small></td><td>'+stamp(x.last_seen)+'</td><td>'+esc(x.visits)+'</td><td>'+duration(x.active_ms)+'</td><td>'+esc(x.clicks)+(Number(x.clicks)>0?'<small class="status-ok">ボタン操作あり</small>':'')+'</td><td>'+esc(x.conversions)+'</td></tr>').join('')||empty(6);
}

async function loadRegisteredCompanies(){
 if(issuerBusy)return;issuerLoading(true);
 try{const rows=[];let total=1;
  while(rows.length<total){const r=await api({api:'admin_companies',offset:rows.length});total=Number(r.total);if(!r.rows.length)break;rows.push(...r.rows);issuerStatus(rows.length.toLocaleString('ja-JP')+' / '+total.toLocaleString('ja-JP')+'社を読み込み中…');}
  receiveCompanies(rows);issuerStatus(rows.length?'登録済み '+rows.length.toLocaleString('ja-JP')+'社を表示しました。会社を検索してURLをコピーできます。':'登録済みの会社はまだありません。「1社だけ発行」から登録してください。');
 }catch(e){issuerStatus(e.message||'会社の一覧を取得できませんでした。再度お試しください。',true);}finally{issuerLoading(false);}
}
document.querySelectorAll('[data-issuer-mode]').forEach(b=>b.addEventListener('click',()=>{selectIssuerMode(b.dataset.issuerMode);if(b.dataset.issuerMode==='registered')loadRegisteredCompanies();}));
el('reloadCompanyLinks').addEventListener('click',loadRegisteredCompanies);
el('singleCompanyType').addEventListener('change',updateSingleContact);
el('singleCompanyForm').addEventListener('submit',async e=>{
 e.preventDefault();if(issuerBusy)return;
 try{requireBaseURL();}catch(e){el('baseURLStatus').textContent=e.message;el('baseURLStatus').className='status-warn';issuerStatus(e.message,true,'singleCompanyStatus');el('companyBaseURL').focus();return;}
 let row;try{row=singleCompanyEntry(el('singleCompanyName').value,el('singleCompanyType').value,el('singleCompanyContact').value);}catch(e){issuerStatus(e.message,true,'singleCompanyStatus');return;}
 issuerLoading(true);issuerStatus('専用URLを発行しています…',false,'singleCompanyStatus');
 try{const r=await api({api:'admin_import_companies',rows:[row]});receiveCompanies(r.rows);issuerStatus(row.company_name+'のURLを発行しました。下の「URLをコピー」から共有してください。',false,'singleCompanyStatus');el('companyResults').scrollIntoView({behavior:'smooth',block:'start'});}
 catch(e){issuerStatus(e.message||'URLを発行できませんでした。再度お試しください。',true,'singleCompanyStatus');}finally{issuerLoading(false);}
});
el('companyFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>10000000)throw Error('CSVは10MB以下にしてください。');el('companyRows').value=await f.text();el('companyFileName').textContent=f.name;issuerStatus('ファイルを読み込みました。内容を確認して「一覧からURLを発行する」を押してください。');}catch(e){issuerStatus(e.message,true);}});
el('insertCompanyExample').addEventListener('click',()=>{
 if(el('companyRows').value.trim()){issuerStatus('入力済みの一覧はそのまま残しています。先頭行を「会社名」と「電話番号」にしてください。');return;}
 el('companyRows').value='会社名\t電話番号\n';el('companyRows').focus();issuerStatus('列名を入力しました。2行目から会社名と電話番号を貼り付けてください。');
});
el('companyBaseURL').addEventListener('input',()=>{baseURLState();renderGeneratedCompanies();});
el('companyResultSearch').addEventListener('input',()=>{issuedPage=0;renderGeneratedCompanies();});
el('issuedPrevious').addEventListener('click',()=>{issuedPage--;renderGeneratedCompanies();});
el('issuedNext').addEventListener('click',()=>{issuedPage++;renderGeneratedCompanies();});
el('companyLinkForm').addEventListener('submit',async e=>{
 e.preventDefault();if(issuerBusy)return;
 try{requireBaseURL();}catch(e){el('baseURLStatus').textContent=e.message;el('baseURLStatus').className='status-warn';issuerStatus(e.message,true);el('companyBaseURL').focus();return;}
 let rows;try{rows=parseCompanyList(el('companyRows').value);}catch(e){issuerStatus(e.message,true);return;}
 issuerLoading(true);const issued=[];
 try{
  for(let offset=0;offset<rows.length;offset+=200){issuerStatus('専用URLを発行中… '+offset.toLocaleString('ja-JP')+' / '+rows.length.toLocaleString('ja-JP')+'社');const r=await api({api:'admin_import_companies',rows:rows.slice(offset,offset+200)});issued.push(...r.rows);}
  receiveCompanies(issued);issuerStatus(issued.length.toLocaleString('ja-JP')+'社のURLを発行しました。1社ずつコピーするか、全件をCSVに出力できます。');el('companyResults').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){if(issued.length)receiveCompanies(issued);issuerStatus(e.message+(issued.length?' 途中までの登録は保存されています。同じ一覧で再実行しても重複登録されません。':''),true);}finally{issuerLoading(false);}
});
el('downloadCompanyLinks').addEventListener('click',()=>{
 try{
  if(!generatedCompanies.length)throw Error('先に会社別URLを発行してください。');
  const base=el('companyBaseURL').value.trim();
  if(generatedCompanies.some(r=>/^[=+@-]/.test(r.recipient_email)))throw Error('記号から始まるメールアドレスが含まれています。アドレスを変更せず安全に出力するため、元のシートへURL列だけ転記してください。');
  const cell=v=>'"'+String(/^[\s]*[=+@-]/.test(String(v))?"'"+v:v).replace(/"/g,'""')+'"';
  const withRef=generatedCompanies.some(r=>r.external_ref);
  const rows=[['会社名','メールアドレス','案件エリアマップURL',...(withRef?['会社ID・電話番号']:[])],...generatedCompanies.map(r=>[r.company_name,r.recipient_email,buildCompanyURL(base,r.code),...(withRef?[r.external_ref||'']:[])])];
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='company-map-links.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  issuerStatus(generatedCompanies.length.toLocaleString('ja-JP')+'社すべてのCSVを作成しました。検索結果にかかわらず全件が含まれます。メール送信はこの画面では行いません。');
 }catch(e){issuerStatus(e.message,true);}
});
el('companyLinksPreview').addEventListener('click',async e=>{
 const button=e.target.closest('[data-copy-company]');if(!button)return;
 try{const row=generatedCompanies[Number(button.dataset.copyCompany)];if(!row)throw Error('会社を確認してください。');await navigator.clipboard.writeText(buildCompanyURL(el('companyBaseURL').value.trim(),row.code));button.textContent='コピーしました';issuerStatus(row.company_name+'のURLをコピーしました。この会社へ共有してください。');setTimeout(()=>{button.textContent='URLをコピー';},2500);}
 catch(e){issuerStatus(e.message||'コピーできませんでした。表示されたURLを選択してコピーしてください。',true);}
});
document.querySelector('.issuer-help-link').addEventListener('click',e=>{e.preventDefault();el('issuerHelp').open=true;el('issuerHelp').scrollIntoView({behavior:'smooth',block:'start'});});
