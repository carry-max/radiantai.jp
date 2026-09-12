# Radiant Review：販売前の接続と検証

通常解析を運営側のAIキーで提供し、無料1試合・Review 5試合・Climb 10試合をサーバーで管理します。各試合は最大3場面、各場面は最大6枚です。接続情報が未設定の間、録画のローカル切り出しとサンプル表示を利用できます。有料購入は無効です。

## AIMモードの測定範囲と費用

立ち回りとAIMは同一料金（Review 900円、Climb 1,800円）。1録画あたり合計3成功解析を共有する。AIMはユーザー指定の撃ち始め付近から[-0.4,-0.2,-0.08,0,+0.12,+0.4]秒の6枚を端末で切り出し、中央拡大512pxまたは全画面最大幅512pxとして1回のAIリクエストに送る。detail=low、出力上限2,600トークン。同じモード・範囲・時刻の再表示は無料。モデルや実際の応答量で原価は変動するため、従来と同額のAPI請求は保証しない。利用量にreview_mode/input_imagesを残し、実請求をモード別に確認する。

AIM評価は入力の異なる3時刻以上に対応した根拠を要求し、AIM・照準配置のみ1〜3で評価する。反応速度、命中率、発砲・入力の正確な時刻、マウス速度、ストッピング、回線によるピークアドバンテージは測定しない。月間ミッション・通常ミッション・XPには影響させない。補助グラフの頭と照準の位置は手動指定で、画像の高さに対する相対距離として端末内だけで計算する。中央拡大/全画面、異なる距離・敵・武器を直接比較しない。

実録画での品質検証は未実施。60fpsの自分視点の録画を用意し、敵が中央から外れる場面、照準が隠れる場面、低fps、オーバーレイ付き、録画端、敵切り替えについて人間の判定と照合する。時刻表示は切り出しの指定時刻であり、録画のフレーム精度や実際の射撃時刻を保証しない。

## 接続項目

- OpenAI Developersで運営用キーを作成し、Node.jsホストのシークレット`OPENAI_API_KEY`に保存する。利用者にキーを配布しない。
- Stripeのテスト用キーとWebhookで支払い・確認・更新・更新停止を検証してから本番設定にする。
- Webhook対象：checkout.session.completed、checkout.session.async_payment_succeeded、customer.subscription.updated、customer.subscription.deleted、invoice.paid。
- PayPayは利用申請とテストを完了した場合のみPAYPAY_ENABLED=trueにする。
- MERCHANT_NAME、MERCHANT_REPRESENTATIVE、MERCHANT_ADDRESS、MERCHANT_PHONE、SUPPORT_EMAILを運営者本人の正しい情報で設定する。
- Riot Developer Portalへの登録と収益化条件を確認し、承認状態がApprovedまたはAcknowledgedであることを確認してからRIOT_PRODUCT_APPROVED=trueにする。非公式表記は承認の代わりにはならない。
- `radiantai.jp`をVercelへ接続し、Supabase Pooler URLをVercelの`SUPABASE_DATABASE_URL`へ登録する。Railwayは動画解析サービスだけを配置し、両方の`/health`を確認する。

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
