"""Build the original, public sales kit. Contains no leads or customer records."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/downloads'
OUT.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
FONT = 'HeiseiKakuGo-W5'
INK, MUTED, LINE, ORANGE = map(HexColor, ['#20282b', '#69716f', '#d9dfdc', '#ed7600'])
WIDTH, HEIGHT = 595.28, 841.89
pages = [
 ('service-guide', 'まずは、自社に合うかを確かめる。', '案件紹介サービス 検討ガイド', [
  ('このマップで確認できること', '外壁・雨漏りの見込案件を、地域・物件条件・受付日から確認できます。全国と地域の件数は同じ集計定義です。掲載は受付時点の情報であり、現在の紹介可否や契約・受注を保証するものではありません。'),
  ('導入前に整理する3つの条件', '1. 対応できる地域：拠点から移動できる範囲と、現調の移動時間。<br/>2. 受けたい工事：工事種別・建物・工期と、自社の得意分野。<br/>3. 受けられる件数：現場と営業の稼働を踏まえた、月間の受け入れ上限。'),
  ('費用を確認するときのチェック項目', '紹介料／固定費／成約時の手数料／保証金等の開始条件／最低契約期間／停止・更新条件／対象外案件の扱いを確認してください。この資料は料金表ではありません。適用される最新条件は、担当者の案内と申込書で確認します。'),
  ('相談から利用検討まで', 'フォームで資料や条件確認を依頼 → 担当者が対応エリア・稼働状況を確認 → 紹介可否と費用・契約条件をご案内 → 内容を確認して判断。フォーム送信だけで、契約・案件購入・有料利用は確定しません。'),
  ('持ち帰る確認事項', '希望エリア：____________________________________<br/>得意な工事：____________________________________<br/>月の受け入れ上限：____________ 件<br/>担当者に確認したいこと：________________________')
 ]),
 ('first-call', '最初の電話で、次の約束をつくる。', '営業準備シート 01 / 初回電話', [
  ('電話前に見ること', '受付日・工事内容・地域・建物・検討時期を確認します。紹介を受けられることが確定してから、お客様へ連絡してください。閲覧用にマスクされた番号へ電話をかけることはできません。'),
  ('冒頭の話し方 / 例', '「外壁工事のご相談についてご連絡しました、〇〇会社の△△です。今、2分ほどお話しできますか。」<br/>名乗りと連絡の理由を先に伝えます。不在や多忙の場合は、話を続けず折り返しの希望を確認します。'),
  ('確認することは、まず3つ', '1. 今いちばん気になっている箇所はどこですか。<br/>2. いつ頃までに工事を進めたいとお考えですか。<br/>3. すでに見積もりや現地調査を依頼されていますか。<br/>電話だけで工事内容や価格を断定せず、現地確認が必要な点を整理します。'),
  ('次の約束を具体的にする / 例', '「現地で状態を確認して、ご希望に合わせてご案内します。〇曜日の午前と△曜日の午後でしたら、どちらがご都合よいでしょうか。」<br/>日時が決まったら、訪問目的・所要時間の目安・同席者・連絡先を確認します。'),
  ('通話後のメモ', '気になる箇所：__________________________________<br/>ご希望の時期：__________________________________<br/>次回の約束：____________________________________<br/>事前に準備するもの：____________________________')
 ]),
 ('follow-up', '見積もりを出した後の、確認を変える。', '営業準備シート 02 / 見積後の追客', [
  ('見積もり提出時に決めること', '見積もりを渡した時点で、次に連絡する日と連絡手段を相談します。「また何かあれば」だけで終わらせず、検討に必要な情報と確認のタイミングを合わせます。'),
  ('状況確認の話し方 / 例', '「先日のお見積もりについて、金額・工事内容・時期のうち、まだ判断しづらい点はありますか。」<br/>「決まりましたか」だけを繰り返さず、相手が比較・判断するうえで不足している点を確認します。'),
  ('迷っている理由ごとの次の対応', '金額：施工範囲や仕様、含まれる作業を一緒に確認する。<br/>内容：写真・図・工事の流れを用いて、分からない点を整理する。<br/>時期：希望する完成時期と、意思決定の予定を確認する。<br/>ご家族：必要な説明資料や、同席で相談できる機会を確認する。'),
  ('次回連絡までに残すこと', '判断しづらい点：________________________________<br/>追加で渡す情報：________________________________<br/>次回連絡日・手段：______________________________<br/>お客様と合意した次の行動：______________________'),
  ('連絡を続ける前に', '連絡頻度や手段は相手の希望に合わせます。お断り・連絡停止の希望があれば尊重してください。事実に基づかない期限、値引き、他社批判で判断を急がせないことが、信頼を守る基本です。')
 ]),
 ('profit-check', '売上の前に、手元に残る額を見る。', '営業準備シート 03 / 採算確認', [
  ('1件を受注したときの概算', '税抜の工事売上から、材料・外注・直接人件費・現場経費・紹介料等を差し引いて確認します。以下は検討用の整理式で、利益や受注を保証するものではありません。'),
  ('受注1件の記入欄', '工事売上（税抜）：__________________________ 円<br/>材料・外注・直接人件費・現場経費：__________ 円<br/>1件の紹介費用等：__________________________ 円<br/>成約時の手数料：____________________________ 円<br/>差引額：____________________________________ 円'),
  ('月全体でも確認する', '月の売上合計から、工事の直接費、受注に至らなかった分も含む全紹介費、成約手数料、固定費を引いて確認します。現調の移動や追客に使う時間も、判断材料に含めます。'),
  ('担当者への質問リスト', '費用が発生するタイミングはいつか。<br/>固定費・紹介料・成約手数料はそれぞれいくらか。<br/>対象外や重複等の扱いはどうなるか。<br/>受け入れ件数の調整、停止、更新の条件は何か。<br/>保証金等の開始条件と、返金条件の記載はあるか。'),
  ('導入判断のメモ', '想定する紹介件数：____________ 件 / 月<br/>自社の成約見込み：____________ 件 / 月<br/>対応のための追加時間：________ 時間 / 月<br/>社内で確認する条件：____________________________<br/>差引額から一般管理費等も考慮し、実際の原価と契約条件で判断します。')
 ])]

def para(c, text, x, top, width, size=10.5, color=INK, leading=19):
 p = Paragraph(text, ParagraphStyle('p', fontName=FONT, fontSize=size, leading=leading, textColor=color, wordWrap='CJK'))
 _, height = p.wrap(width, 700)
 p.drawOn(c, x, top-height)
 return top-height

target = OUT / 'gaiheki-sales-kit.pdf'
c = canvas.Canvas(str(target), pagesize=(WIDTH, HEIGHT), pageCompression=1)
c.setTitle('gaiheki+ サービス検討ガイド・営業準備シート3点')
c.setAuthor('madoguchi株式会社')
for i, (_, title, subtitle, sections) in enumerate(pages):
 c.setFillColor(ORANGE); c.rect(40, HEIGHT-42, 36, 4, fill=1, stroke=0)
 para(c, 'gaiheki+  /  PARTNER GUIDE', 88, HEIGHT-35, 450, 9, MUTED, 13)
 y=para(c, title, 40, HEIGHT-85, WIDTH-80, 23, INK, 34)-16
 y=para(c, subtitle, 40, y, WIDTH-80, 11, ORANGE, 18)-22
 for number,(heading,body) in enumerate(sections,1):
  c.setStrokeColor(LINE);c.line(40,y,WIDTH-40,y);y-=15
  y=para(c, f'{number:02d}  {heading}',40,y,WIDTH-80,12,INK,19)-7
  y=para(c,body,40,y,WIDTH-80,10,INK,16.5)-16
 assert y>57,(i,y)
 c.setStrokeColor(LINE);c.line(40,48,WIDTH-40,48)
 para(c,'madoguchi株式会社  |  2026年11月版  |  導入判断・営業準備のための参考資料',40,37,WIDTH-100,7.2,MUTED,10)
 para(c,f'{i+1:02d} / 04',WIDTH-80,37,60,8,MUTED,10)
 c.showPage()
c.save()
reader=PdfReader(target)
for i,(slug,*_) in enumerate(pages):
 writer=PdfWriter();writer.add_page(reader.pages[i]);writer.add_metadata({'/Title':pages[i][2],'/Author':'madoguchi株式会社'})
 with (OUT / (slug+'.pdf')).open('wb') as output:writer.write(output)
print('Built 4-page kit and 4 individual PDFs, without customer data.')
