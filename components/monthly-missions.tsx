"use client";

import { useState } from "react";
import { Award, BrainCircuit, CalendarDays, CheckCircle2, Clock3, Film, LoaderCircle, RotateCcw, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DAY_MS, MONTHLY_BONUS_XP, WEEKLY_XP, monthlyPhase, type MonthlySummary, type MonthlyTask } from "@/lib/monthly-missions";

const STAGES = ["基本の修正", "別の試合で再現", "判断を応用", "今月の重点を再確認"];
const EXAMPLE_TASKS: MonthlyTask[] = [
  { title: "遮蔽の近くで勝負する", action: "接敵するとき、すぐに戻れる遮蔽のそばに位置取る。", success_criteria: "接敵前のフレームで、自分の近くに退避できる壁や箱が見える。" },
  { title: "味方と同じ射線に入る", action: "単独で進まず、味方と同じ敵を狙える位置で接敵する。", success_criteria: "ミニマップと画面上で、味方が同じ接敵場所へ射線を通せる位置関係を確認できる。" },
  { title: "複数の射線を同時に見せない", action: "壁を使って、敵が出てくる方向を一つに絞る。", success_criteria: "接敵前の画像で別方向の射線が遮蔽に遮られ、一つの方向だけに体を出している。" },
  { title: "安全な接敵をもう一度", action: "別の試合でも、遮蔽と味方の位置を活かして接敵する。", success_criteria: "今回の接敵場面で、近くの遮蔽と味方のカバー可能な位置関係を両方確認できる。" },
];

const formatDate = (value: string) => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" }).format(new Date(value));
const formatSeconds = (time: number) => `${Math.floor(time / 60).toString().padStart(2, "0")}:${Math.floor(time % 60).toString().padStart(2, "0")}`;

export function MonthlyMissions({ summary, loading, error, notice, now, recordingId, renewRequested, onRenew, onRetry, onChooseVideo, onEvidence }: {
  summary: MonthlySummary | null;
  loading: boolean;
  error: string;
  notice: string;
  now: number;
  recordingId: string;
  renewRequested: boolean;
  onRenew: () => void;
  onRetry: () => void;
  onChooseVideo: () => void;
  onEvidence: (time: number) => void;
}) {
  const [example, setExample] = useState(false);
  const cycle = summary?.cycle;
  const phase = cycle ? monthlyPhase(cycle, now) : null;
  const daysRemaining = cycle ? Math.max(0, Math.ceil((Date.parse(cycle.endsAt) - now) / DAY_MS)) : 30;
  const canRenew = Boolean(cycle && now >= Date.parse(cycle.endsAt));
  const tasks = cycle?.tasks ?? (example ? EXAMPLE_TASKS : null);
  const completed = cycle?.currentStep ?? 0;
  const lastCheck = cycle?.checks[0];

  return (
    <section id="monthly-missions" className="panel monthly-panel" aria-labelledby="monthly-title" aria-busy={loading}>
      <div className="monthly-heading">
        <span className="monthly-icon"><CalendarDays aria-hidden="true" /></span>
        <div><p className="eyebrow">30 DAY TRAINING</p><h2 id="monthly-title">1か月ミッション</h2></div>
        <Badge variant="outline" className="monthly-all-users">全ユーザー利用可</Badge>
        <div className="monthly-period">
          {cycle ? <><strong>{phase === "completed" ? "月間ミッション達成" : phase === "expired" ? "期間終了" : `残り${daysRemaining}日`}</strong><span>{formatDate(cycle.startedAt)} 〜 {formatDate(cycle.endsAt)}（日本時間）</span></> : <><strong>開始から30日間</strong><span>最初のAIレビューでスタート</span></>}
        </div>
      </div>

      <div className="monthly-overview">
        <div><span className="monthly-label">今月の重点</span><h3>{cycle?.baselineFocus || "反省点を、4週間の練習に変える。"}</h3>
          <p>{cycle ? "週は進め方の目安。30日以内なら前倒しで挑戦できます。達成は次の別の録画でAIが確認します。" : "最初の録画から4つの課題を作成。その後は別の録画で1つずつ達成を確認します。"}</p>
        </div>
        <div className="monthly-progress"><div><strong>{completed}<small> / 4 達成</small></strong><span>月間 {cycle?.xp ?? 0} / 300 XP</span></div><Progress value={completed * 25} aria-label="月間ミッション達成率" /><small>各課題 {WEEKLY_XP} XP ＋ 4つ達成で {MONTHLY_BONUS_XP} XP</small></div>
      </div>

      {error ? <div className="monthly-feedback error" role="alert"><span>{error}</span><Button size="sm" variant="outline" onClick={onRetry}><RotateCcw /> 再読み込み</Button></div> : null}
      {notice ? <p className="monthly-feedback" role="status">{notice}</p> : null}
      {loading ? <p className="monthly-loading"><LoaderCircle className="spin" /> ミッションを読み込んでいます…</p> : null}
      {!cycle && example ? <p className="monthly-example-label">ミッションの表示例です。実際の課題はあなたの録画から作成され、ここでは保存・XP加算は行いません。</p> : null}

      <div className="monthly-weeks">
        {STAGES.map((stage, index) => {
          const task = tasks?.[index];
          const cleared = index < completed;
          const active = Boolean(cycle && phase === "active" && index === completed);
          const attempt = cycle?.checks.find((check) => check.step === index);
          return (
            <article key={stage} className={`monthly-week ${cleared ? "is-cleared" : active ? "is-current" : ""}`} aria-current={active ? "step" : undefined}>
              <div className="monthly-week-top"><span>第{index + 1}週</span><Badge variant="outline">{cleared ? "達成" : active ? "挑戦中" : cycle ? phase === "expired" ? "未達成" : "次の課題" : "課題作成前"}</Badge></div>
              <span className="monthly-stage-icon">{cleared ? <CheckCircle2 /> : <Target />}</span>
              <p className="monthly-stage-name">{stage}</p>
              <h4>{task?.title || stage}</h4>
              <p>{task?.action || "最初の録画をAIが確認すると、あなたに合う具体的な課題がここに入ります。"}</p>
              {task ? <div className="monthly-criteria"><strong><CheckCircle2 aria-hidden="true" /> 達成の条件</strong><span>{task.success_criteria}</span></div> : null}
              <div className="monthly-week-foot"><span><Award /> +{WEEKLY_XP} XP</span>{cleared ? <small>AI確認済み</small> : attempt ? <small>{attempt.status === "improving" ? "改善中" : attempt.status === "not_cleared" ? "次の録画へ継続" : "映像不足・保留"}</small> : null}</div>
            </article>
          );
        })}
      </div>

      {lastCheck ? <div className={`monthly-evidence ${lastCheck.status}`}>
        <BrainCircuit aria-hidden="true" /><div><strong>第{lastCheck.step + 1}週のAI確認 {lastCheck.xp > 0 ? `・+${lastCheck.xp} XP` : "・加点なし"}</strong><p>{lastCheck.evidence}</p>
          {lastCheck.evidence_times.length ? <div className="monthly-evidence-times"><span>根拠の時刻</span>{lastCheck.evidence_times.map((time) => lastCheck.recordingId === recordingId ? <Button key={time} size="sm" variant="outline" onClick={() => onEvidence(time)}><Film />{formatSeconds(time)}</Button> : <span key={time} className="monthly-timestamp">{formatSeconds(time)}</span>)}</div> : null}
        </div>
      </div> : null}

      <div className="monthly-bottom">
        <p><Clock3 /> 判定は切り出した場面が対象です。映像不足は保留、未達成でも減点なし。獲得したXPは期間終了後も残ります。</p>
        {canRenew ? <Button disabled={loading || Boolean(error) || renewRequested} onClick={onRenew}><RotateCcw />{renewRequested ? "次の録画の解析で開始" : "次の30日を始める"}</Button> : !cycle ? <div className="monthly-empty-actions"><Button variant="outline" onClick={() => setExample((current) => !current)}>{example ? "例を閉じる" : "ミッションの例を見る"}</Button><Button onClick={onChooseVideo}><Film /> 最初の録画を選ぶ</Button></div> : phase === "active" ? <Button onClick={onChooseVideo}><Film /> 次の録画を選ぶ</Button> : <span className="monthly-completed"><Award /> 月間ボーナス獲得</span>}
      </div>
      <p className="monthly-cost-note">作成・判定は通常のAIレビューと一緒に行います。プラン内での追加料金はありません。ミッション開始による購入・契約更新はありません。自分のAPIキーで試す場合はAPI利用料が別途発生します。XPは切り出した場面での達成記録で、ランクや試合全体の上達を保証するものではありません。</p>
    </section>
  );
}
