"use strict";
const thanksParams=new URLSearchParams(location.hash.slice(1));
const thanksReceipt=thanksParams.get("receipt")||"",thanksAction=thanksParams.get("intent");
const thanksIntents={respond:{label:"案件への対応希望",copy:"担当者が内容を確認し、案件の紹介可否や条件についてご入力のお電話番号へご連絡します。"},conditions:{label:"案件・紹介条件のご相談",copy:"担当者が内容を確認し、ご希望のエリアや紹介条件についてご入力のお電話番号へご連絡します。"},materials:{label:"サービス資料のご請求",copy:"営業担当から、ご入力のメールアドレスへサービス資料をお送りします。Webでのご案内をご希望の方は、下の予約ボタンから日時をお選びください。"},trial:{label:"無料トライアルのご相談",copy:"担当者からご入力のお電話番号へご連絡し、対象エリアやトライアルの実施条件をご案内します。Webで直接ご相談する場合は、下の予約ボタンをご利用ください。"}};
if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(thanksReceipt)&&Object.hasOwn(thanksIntents,thanksAction)){
 document.getElementById("thanksHeading").textContent="お問い合わせ、ありがとうございます。";
 document.getElementById("thanksEyebrow").textContent="送信を受け付けました";
 document.getElementById("thanksCopy").textContent=thanksIntents[thanksAction].copy;
 document.getElementById("thanksIntent").textContent=thanksIntents[thanksAction].label;
 document.getElementById("thanksReference").textContent=thanksReceipt;
 let saved;try{saved=JSON.parse(sessionStorage.getItem("lead-map-confirmation")||"null")}catch{}
 const valid=saved?.request_id===thanksReceipt;
 const date=valid&&saved.preferred_window==="now"?"今すぐの連絡を希望":valid&&/^\d{4}-\d{2}-\d{2}$/.test(saved.preferred_date||"")?saved.preferred_date.replaceAll("-","/"):"指定なし";
 const time=valid&&saved.preferred_window==="now"?"今すぐ":valid&&/^(09|1[0-9]|20):00-(1[0-9]|2[01]):00$/.test(saved.preferred_window||"")?saved.preferred_window.replace("-","〜"):"指定なし";
 document.getElementById("thanksDate").textContent=date;
 document.getElementById("thanksTime").textContent=time;
 document.getElementById("thanksSummary").hidden=false;
 document.getElementById("thanksResources").hidden=true;
 // Return directly to the map; browser back would revisit the external POST.
}
