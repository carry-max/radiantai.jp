import { serviceConfig, merchantConfigured } from "@/lib/service-config";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default function LegalPage() {
  const merchant = serviceConfig().merchant;
  return <main className="legal-page"><Link href="/">← Radiant Reviewに戻る</Link><h1>販売条件・運営情報</h1>
    {!merchantConfigured() ? <p className="billing-setup-note">販売準備中です。運営情報が確定するまで、有料プランの購入・請求は行えません。</p> : null}
    <h2>特定商取引法に基づく表記</h2><dl>
      <dt>販売事業者</dt><dd>{merchant.name || "販売開始前に掲載"}</dd>
      <dt>運営責任者</dt><dd>{merchant.representative || "販売開始前に掲載"}</dd>
      <dt>所在地</dt><dd>{merchant.address || "販売開始前に掲載"}</dd>
      <dt>電話番号</dt><dd>{merchant.phone || "販売開始前に掲載"}</dd>
      <dt>お問い合わせ</dt><dd>{merchant.email ? <a href={`mailto:${merchant.email}`}>{merchant.email}</a> : "販売開始前に掲載"}</dd>
      <dt>販売価格</dt><dd>Radiant AI：月額900円（税込）、またはPayPay 30日パス900円（税込）。立ち回りは最大50試合、ミクロは最大5試合、Deepは最大2試合です。</dd>
      <dt>料金に含まれるもの</dt><dd>通常プランのAI解析費。追加の従量請求はありません。通信費はお客様負担です。任意の「自分のAPIキーで試す」機能は別契約で、ご自身のOpenAIアカウントにAPI利用料が発生します。</dd>
      <dt>支払方法・時期</dt><dd>カード：初回購入時と以降毎月の更新日に支払い。PayPay：購入時の1回払い。利用できる方法は料金画面に表示します。</dd>
      <dt>提供時期・期間</dt><dd>決済確認後に利用できます。PayPayは30日間で終了し、自動更新しません。カードは月単位で、更新を停止するまで継続します。カードを12か月継続した場合の総額は10,800円（税込）です。</dd>
      <dt>利用範囲・上限</dt><dd>立ち回りは録画を使わず、Riot APIの最大50試合をJevで分類してGPTが判断傾向を整理します。ミクロはOverwolfが死亡前25秒〜後5秒をWindows端末へ自動保存し、最大5試合をGeminiで映像解析してGPTが改善点を整理します。Deepは最大2試合です。Riot連携機能はRiot公式承認後に有効化します。1アカウント1日12回（失敗・保留を含む、日本時間）まで受け付けます。</dd>
      <dt>解析枠</dt><dd>有料期間では立ち回り、ミクロ、Deepを別々に数えます。別モードに未使用枠がある場合、合計2試合まで自動振替できます。無料体験は全モード合計1試合です。解析失敗・判定保留では試合枠を消費しません。同じ結果の再表示は追加消費しません。未使用枠は次の期間へ繰り越しません。</dd>
      <dt>解約</dt><dd>カードの次回更新は、次の更新日時より前に「料金・利用状況」から停止できます。停止後も期間末まで残り枠を使えます。PayPayは更新停止の操作は不要です。</dd>
      <dt>返金</dt><dd>お客様都合の購入後返金・未使用枠の日割り返金は原則ありません。重複請求・誤請求は確認のうえ返金します。事業者都合で契約期間内にサービスを提供できなかった場合は、未提供分の返金を含め個別対応します。法令に基づく権利を制限しません。</dd>
      <dt>動作環境</dt><dd>録画ファイルを扱えるPCブラウザとインターネット接続が必要です。Riot AIとAIM自動クリップには、Overwolf対応のWindows版Radiant AIアプリが必要です。MP4・WebM・MOVはブラウザが再生できる形式に限ります。購入前に無料の録画切り出し機能で再生を確認してください。</dd>
    </dl><h2>サービスの位置づけ</h2><p>試合後の振り返りを支援するAIサービスです。ランク上昇や勝率向上を保証するものではありません。ゲームへの接続・操作や、試合中の助言は行いません。Riot Gamesの公式サービスではなく、Riot Gamesによる推奨・保証を受けたものではありません。</p>
    <p><Link href="/privacy">データの取り扱い</Link></p>
  </main>;
}
