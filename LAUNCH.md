# Radiant Review：販売前の接続と検証

通常解析を運営側のAIキーで提供し、無料1試合・Review 5試合・Climb 10試合をサーバーで管理します。各試合は最大3場面、各場面は最大6枚です。接続情報が未設定の間、録画のローカル切り出しとサンプル表示を利用できます。有料購入は無効です。

## 運営者の設定

- OpenAI DevelopersのAPIキースキルで運営用キーを設定し、SitesのシークレットOPENAI_API_KEYに保存する。利用者にキーを配布しない。
- Stripeのテスト用キーとWebhookで支払い・確認・更新・更新停止を検証してから本番設定にする。
- Webhook対象：checkout.session.completed、checkout.session.async_payment_succeeded、customer.subscription.updated、customer.subscription.deleted、invoice.paid。
- PayPayは利用申請とテストを完了した場合のみPAYPAY_ENABLED=trueにする。
- MERCHANT_NAME、MERCHANT_REPRESENTATIVE、MERCHANT_ADDRESS、MERCHANT_PHONE、SUPPORT_EMAILを運営者本人の正しい情報で設定する。
- Riot Developer Portalへの登録と収益化条件を確認し、承認状態がApprovedまたはAcknowledgedであることを確認してからRIOT_PRODUCT_APPROVED=trueにする。非公式表記は承認の代わりにはならない。
- 一般公開はSitesのアクセス変更が別途必要。現在の所有者限定公開は自動で変更しない。

無料体験はログインしたアカウントごとに1試合。通常解析は1ユーザーにつき同時1件、1日12回（失敗・保留も含む、日本時間）、全体は既定1日200回です。REVIEW_DAILY_LIMITで全体上限を設定します。上限は費用の保証額ではないため、OpenAI側の支出管理も設定してください。

## 30〜50人の試用で測ること

1. 同意を得た実録画を、人間のコーチとAIで独立評価する。根拠時刻の正しさ、誤った断定、役立つ指摘を記録する。
2. 1場面あたりの入力・出力トークンと実際の請求額を比較する。analysis_records.usage_jsonに利用量を保存する。月200円/人という事業試算は未検証の仮定。
3. 初回成功までの離脱、翌週の再利用、体験からの課金、翌月継続を測る。analysis_records、billing_payments、billing_entitlementsから実解析・購入を集計する。ブラウザのデモを実績に含めない。
4. helpful / incorrectの評価を元レビューと突き合わせて改善する。評価は品質の実測であり、ランク上昇の証明ではない。
5. 広告費を増やす前に、1人の獲得費用と継続期間で回収できるかを確認する。

## 外部接続の受け入れ確認

初回購入・同時の購入操作・二重通知・非同期PayPay完了・カード更新成功/失敗・自動更新停止・期間終了をStripeテストモードで確認してください。今回は本物のAPI呼び出し、決済、返金、Riot申請、顧客への連絡を実行していません。

## 仕様の参照

- https://developer.riotgames.com/docs/valorant
- https://www.no-trouble.caa.go.jp/what/mailorder/
- https://stripe.com/jp/pricing
- https://developers.openai.com/api/reference/responses/create
