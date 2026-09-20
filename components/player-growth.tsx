"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BookOpen, Check, Crosshair, LoaderCircle, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useAccount } from "@/components/account-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PLAYER_SKILLS, LEVEL_LABELS, growthComparison, type GrowthSource, type PlayerGrowthRecord, type PlayerSkillId } from "@/lib/player-growth";

type GrowthData = { records: PlayerGrowthRecord[]; signedIn: boolean; serverNow: string; error?: string };
const dateLabel = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(value));
const point = (index: number, value: number, radius = 178) => {
  const angle = -Math.PI / 2 + index * Math.PI / 6;
  return { x: 300 + Math.cos(angle) * radius * value / 100, y: 265 + Math.sin(angle) * radius * value / 100 };
};
const pointText = (index: number, value: number) => { const p = point(index, value); return `${p.x},${p.y}`; };

function RadarShape({ values, previous = false }: { values: (number | null)[]; previous?: boolean }) {
  const complete = values.every(value => value !== null);
  const className = previous ? "radar-previous" : "radar-current";
  return <g className={className}>
    {complete ? <polygon points={values.map((value, i) => pointText(i, value!)).join(" ")} /> : values.map((value, i) => {
      const next = values[(i + 1) % values.length];
      return value !== null && next !== null ? <polyline key={i} points={`${pointText(i, value)} ${pointText((i + 1) % values.length, next)}`} /> : null;
    })}
    {values.map((value, i) => { if (value === null) return null; const p = point(i, value); return <circle key={i} cx={p.x} cy={p.y} r={previous ? 3.5 : 4.5}><title>{PLAYER_SKILLS[i].label}：{value}点</title></circle>; })}
  </g>;
}

export function PlayerGrowth({ refreshKey = 0 }: { refreshKey?: number }) {
  const accountFetch = useAccount().request;
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState<GrowthSource>("self");
  const [days, setDays] = useState(30);
  const [selected, setSelected] = useState<PlayerSkillId>("peeking");
  const [example, setExample] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const requestId = useRef(0);
  const recordId = useRef("");
  const chartId = useId();

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError("");
    try {
      const response = await accountFetch("/api/player-growth", { cache: "no-store" });
      const next = await response.json() as GrowthData;
      if (!response.ok) throw new Error(next.error || "成長記録を読み込めませんでした。");
      if (id === requestId.current) setData(next);
    } catch (e) { if (id === requestId.current) setError(e instanceof Error ? e.message : "読み込みに失敗しました。"); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [accountFetch]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    const visible = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [reload, refreshKey]);

  const comparison = useMemo(() => growthComparison(data?.records || [], source, days, data ? Date.parse(data.serverNow) : 0), [data, source, days]);
  const selectedAxis = comparison.axes.find(axis => axis.id === selected)!;
  const known = comparison.axes.filter(axis => axis.current.value !== null);
  const strongestChange = comparison.axes.filter(axis => axis.current.value !== null && axis.previous.value !== null)
    .sort((a, b) => Math.abs(b.current.value! - b.previous.value!) - Math.abs(a.current.value! - a.previous.value!))[0];
  const recent = comparison.current.filter(r => r.ratings.some(rating => rating.skill === selected)).slice(0, 12).reverse();
  const latestEvidence = recent.at(-1)?.ratings.find(r => r.skill === selected);
  const latestRecords = (data?.records || []).filter(r => r.source === source).slice(0, 10);
  const currentValues = example ? [60, 80, 60, 40, 60, 80, 60, 40, 80, 60, 40, 80] : comparison.axes.map(axis => axis.current.value);
  const previousValues = example ? [40, 60, 40, 40, 40, 60, 40, 20, 60, 40, 40, 60] : comparison.axes.map(axis => axis.previous.value);
  const delta = selectedAxis.current.value !== null && selectedAxis.previous.value !== null ? selectedAxis.current.value - selectedAxis.previous.value : null;

  const openEditor = () => {
    recordId.current = crypto.randomUUID(); setDraft({}); setLabel(""); setNote(""); setSaveError(""); setEditorOpen(true);
  };
  const save = async () => {
    const ratings = PLAYER_SKILLS.filter(skill => draft[skill.id] > 0).map(skill => ({ skill: skill.id, level: draft[skill.id] }));
    if (!ratings.length) { setSaveError("確認できた項目を1つ以上選んでください。"); return; }
    setSaving(true); setSaveError("");
    try {
      const response = await accountFetch("/api/player-growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: recordId.current, label: label.trim() || "今日の振り返り", note: note.trim(), ratings }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "保存できませんでした。");
      setEditorOpen(false); setSource("self"); setExample(false); setNotice("自己評価を保存しました。次の記録と比較していきましょう。"); await reload();
    } catch (e) { setSaveError(e instanceof Error ? e.message : "保存できませんでした。"); }
    finally { setSaving(false); }
  };
  const remove = async (record: PlayerGrowthRecord) => {
    if (!window.confirm(`${dateLabel(record.recordedAt)}「${record.label}」の自己評価を削除しますか？グラフも再計算します。`)) return;
    setDeleting(record.id); setNotice("");
    try {
      const response = await accountFetch("/api/player-growth", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "削除できませんでした。");
      setNotice("自己評価を削除しました。"); await reload();
    } catch (e) { setNotice(e instanceof Error ? e.message : "削除できませんでした。"); }
    finally { setDeleting(null); }
  };

  return <section className="player-growth panel" id="player-growth" aria-labelledby="player-growth-title">
    <header className="pg-header">
      <div><p className="eyebrow">PLAYER DEVELOPMENT / 12 SKILLS</p><h2 id="player-growth-title"><Activity /> あなたの成長マップ</h2><p>撃ち合いからラウンド判断まで。伸びた力と、次に磨く力を見つけよう。</p></div>
      <Badge variant="outline"><ShieldCheck /> 全ユーザー無料</Badge>
    </header>
    <div className="pg-toolbar">
      <div className="pg-source" role="group" aria-label="評価の種類">
        <button type="button" aria-pressed={source === "self"} onClick={() => { setSource("self"); setExample(false); }}>自己評価</button>
        <button type="button" aria-pressed={source === "ai"} onClick={() => { setSource("ai"); setExample(false); }}>AIレビュー</button>
      </div>
      <label className="pg-period"><span>比較期間</span><NativeSelect value={days} onChange={e => { setDays(Number(e.target.value)); setExample(false); }} aria-label="成長グラフの比較期間">{[7, 30, 90].map(n => <NativeSelectOption key={n} value={n}>直近{n}日</NativeSelectOption>)}</NativeSelect></label>
      <Button className="pg-record-button" onClick={openEditor} disabled={loading || !data?.signedIn}><Plus /> 今日の評価を記録</Button>
    </div>
    <p className="pg-explanation">{source === "self" ? "自己評価は1〜5段階。射撃場・カスタム・試合での練習を、同じ基準で振り返ります。AI未接続でも記録できます。" : "AI解析で映像の根拠を確認できた項目が自動で追加されます。静止画での場面評価は1〜3段階（最大60点）。安定性・定着の4〜5は判定しません。"} グラフ閲覧と自己評価の保存にプラン加入は不要です。</p>
    {error ? <div className="pg-alert" role="alert">{error}<Button variant="ghost" size="sm" onClick={() => void reload()}><RotateCcw /> 再読み込み</Button></div> : null}
    {!loading && data && !data.signedIn ? <p className="pg-alert"><a href="/signin-with-chatgpt?return_to=%2F%23player-growth" target="_top">ログインして自分の成長を記録する</a> · 記録は本人のアカウントに保存します。</p> : null}
    {notice ? <p className="pg-notice" role="status">{notice}</p> : null}
    <div className="pg-stats">
      <div><span>評価済みの項目</span><strong>{known.length}<small> / 12</small></strong></div>
      <div><span>直近{days}日の記録</span><strong>{comparison.current.length}<small> 件</small></strong></div>
      <div><span>変化が大きい項目</span><strong className="pg-change-name">{strongestChange ? strongestChange.label : "比較データ待ち"}</strong><small>{strongestChange ? `${strongestChange.current.value! - strongestChange.previous.value! > 0 ? "+" : ""}${strongestChange.current.value! - strongestChange.previous.value!}点 · 前の${days}日との比較` : "両期間に記録すると表示"}</small></div>
    </div>
    <div className="pg-main">
      <div className="pg-chart-card">
        <div className="pg-chart-heading"><div><span className="pg-live-dot" /> {example ? "グラフの表示例" : source === "self" ? "SELF REVIEW" : "VOD EVIDENCE"}<small>5段階評価 × 20 → 100点表示</small></div><button type="button" className="pg-text-button" aria-pressed={example} onClick={() => setExample(!example)}>{example ? "自分の記録に戻る" : "表示例を見る"}</button></div>
        <svg className="pg-radar" viewBox="0 0 600 530" role="img" aria-labelledby={`${chartId}-title ${chartId}-desc`}>
          <title id={`${chartId}-title`}>{example ? "架空の表示例" : "12項目の成長レーダーチャート"}</title>
          <desc id={`${chartId}-desc`}>{example ? "操作説明用の架空の数値です。あなたの記録や成長集計には含みません。" : `直近${days}日とその前の${days}日を比較。未評価は0点にせず欠測です。各項目の数値は下の一覧でも確認できます。`}</desc>
          {[20, 40, 60, 80, 100].map(value => <circle className="pg-grid-ring" key={value} cx="300" cy="265" r={178 * value / 100} />)}
          {PLAYER_SKILLS.map((skill, i) => { const end = point(i, 100); const text = point(i, 100, 225); return <g key={skill.id}>
            <line className={selected === skill.id ? "pg-spoke selected" : "pg-spoke"} x1="300" y1="265" x2={end.x} y2={end.y} />
            <text className={selected === skill.id ? "pg-axis-label selected" : "pg-axis-label"} x={text.x} y={text.y + 4} textAnchor={Math.abs(text.x - 300) < 1 ? "middle" : text.x > 300 ? "start" : "end"}>{String(i + 1).padStart(2, "0")} {skill.short}</text>
          </g>; })}
          {[20, 40, 60, 80, 100].map(value => <text className="pg-ring-label" key={value} x="307" y={265 - 178 * value / 100 - 4}>{value}</text>)}
          <RadarShape values={previousValues} previous /><RadarShape values={currentValues} />
          <circle cx="300" cy="265" r="3" className="pg-center" />
        </svg>
        {!example && !known.length ? <div className="pg-chart-empty"><Crosshair /><strong>{loading ? "成長記録を読み込み中…" : "ここから、成長の輪郭をつくろう"}</strong><p>{source === "self" ? "まずは今日確認できた項目を1つ記録。12項目すべてを埋めなくても始められます。" : "新しいAIレビューに評価できる根拠があると表示します。過去の指摘の強さから能力点を作りません。"}</p></div> : null}
        <div className="pg-legend"><span><i className="current" />直近{days}日</span><span><i className="previous" />その前の{days}日</span><span>未評価は空欄</span></div>
        <p className={example ? "pg-example-note" : "pg-chart-note"}>{example ? "表示例の数値です。あなたの記録・XP・集計には保存しません。" : "各期間の項目別平均。同じ種類の評価だけを比較します。記録数・状況が違うため、ランクや勝率の予測ではありません。"}</p>
      </div>
      <aside className="pg-detail" aria-live="polite">
        <div className="pg-detail-heading"><p className="eyebrow">{selectedAxis.group}</p><h3>{selectedAxis.label}</h3><div className="pg-selected-score"><strong>{selectedAxis.current.value ?? "—"}</strong><span>/ 100</span>{delta !== null ? <b className={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}{delta > 0 ? "+" : ""}{delta}</b> : <small>比較データ待ち</small>}</div><small>{selectedAxis.current.count}件の評価 {source === "ai" && !selectedAxis.ai && selectedAxis.id !== "aim" ? "· この項目は自己評価で記録" : ""}</small></div>
        <p>{selectedAxis.description}</p>
        <div className="pg-sparkline"><span>この項目の推移 · 期間内の直近12記録</span>{recent.length ? <>
          <svg viewBox="0 0 300 105" role="img" aria-label={`${selectedAxis.label}の記録順の推移。${recent.map(r => `${dateLabel(r.recordedAt)} ${r.ratings.find(v => v.skill === selected)!.level * 20}点`).join("、")}`}>
            {[20, 60, 100].map(v => <g key={v}><line x1="27" x2="290" y1={95 - v * .8} y2={95 - v * .8} /><text x="0" y={99 - v * .8}>{v}</text></g>)}
            {recent.length > 1 ? <polyline points={recent.map((r, i) => `${32 + i * 250 / Math.max(1, recent.length - 1)},${95 - r.ratings.find(v => v.skill === selected)!.level * 16}`).join(" ")} /> : null}
            {recent.map((r, i) => <circle key={r.id} cx={32 + i * 250 / Math.max(1, recent.length - 1)} cy={95 - r.ratings.find(v => v.skill === selected)!.level * 16} r="4"><title>{dateLabel(r.recordedAt)} · {r.ratings.find(v => v.skill === selected)!.level * 20}点</title></circle>)}
          </svg><div><time>{dateLabel(recent[0].recordedAt)}</time><time>{recent.length > 1 ? dateLabel(recent.at(-1)!.recordedAt) : "最初の記録"}</time></div>
        </> : <p>この期間の記録はまだありません。</p>}</div>
        <div className="pg-drill"><h4><Crosshair /> 次の練習</h4><p>{selectedAxis.drill}</p><strong><Check /> 確認ポイント</strong><p>{selectedAxis.check}</p></div>
        {latestEvidence && source === "ai" ? <div className="pg-evidence"><h4>直近のAI評価の根拠</h4><p>{latestEvidence.evidence}</p><small>録画時刻 {latestEvidence.times.map(t => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}`).join(" / ")}</small></div> : null}
        {selected === "peek_advantage" ? <a className="pg-source-link" href="https://www.riotgames.com/en/news/peeking-valorants-netcode" target="_blank" rel="noreferrer">Riot公式：ピークアドバンテージの仕組み ↗</a> : null}
      </aside>
    </div>
    <div className="pg-skill-list" aria-label="項目別の成長と練習メニュー">{comparison.axes.map((axis, i) => {
      const change = axis.current.value !== null && axis.previous.value !== null ? axis.current.value - axis.previous.value : null;
      return <button type="button" key={axis.id} className={selected === axis.id ? "selected" : ""} aria-pressed={selected === axis.id} onClick={() => setSelected(axis.id)}><span className="pg-skill-number">{String(i + 1).padStart(2, "0")}</span><span className="pg-skill-name"><strong>{axis.label}</strong><small>{axis.current.count ? `${axis.current.count}件 · 前期間 ${axis.previous.value ?? "—"}点` : source === "ai" && !axis.ai && axis.id !== "aim" ? "自己評価で確認" : "未評価"}</small></span><span className="pg-skill-value">{axis.current.value ?? "—"}<small className={change !== null && change > 0 ? "positive" : ""}>{change === null ? "" : change > 0 ? `+${change}` : change}</small></span></button>;
    })}</div>
    <details className="pg-guide"><summary><BookOpen /> 評価基準と記録の使い方</summary><div><p>自己評価は、今回練習・確認できた項目だけを選びます。未評価は0点ではありません。4・5は別の場面や試合での再現を確認してから選んでください。</p><ol>{LEVEL_LABELS.slice(1).map(text => <li key={text}>{text}</li>)}</ol><p>立ち回りはRiot APIの複数試合から判断傾向を評価し、ミクロはOverwolfが自動保存した映像から照準・ピーク・射撃制御を評価します。自己評価とAI評価は観測範囲が異なるため混ぜません。表示対象は種類ごとに最新120件。自己評価は1日20件までです。</p></div></details>
    <details className="pg-history"><summary>記録の履歴 <span>{latestRecords.length ? `直近${latestRecords.length}件` : "まだ記録がありません"}</span></summary><div>{latestRecords.map(record => <article key={record.id}><div><time>{dateLabel(record.recordedAt)} {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(record.recordedAt))}</time><strong>{record.label}</strong><p>{record.ratings.map(r => `${PLAYER_SKILLS.find(s => s.id === r.skill)?.label} ${r.level * 20}`).join(" / ")}</p>{record.note ? <small>{record.note}</small> : null}</div>{record.source === "self" ? <Button variant="ghost" size="icon-sm" aria-label={`${dateLabel(record.recordedAt)}の自己評価を削除`} disabled={deleting !== null} onClick={() => void remove(record)}>{deleting === record.id ? <LoaderCircle className="spin" /> : <Trash2 />}</Button> : <Badge variant="outline">AI</Badge>}</article>)}</div></details>
    <Dialog open={editorOpen} onOpenChange={open => { if (!saving) setEditorOpen(open); }}>
      <DialogContent className="pg-editor"><DialogHeader><p className="eyebrow">TODAY’S CHECK-IN</p><DialogTitle>今日の自己評価を記録</DialogTitle><DialogDescription>練習・試合で確認できた項目を1〜5で評価。未確認は空欄のまま保存できます。自己評価は無料で、解析枠もXPも変更しません。</DialogDescription></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); void save(); }}><div className="pg-editor-scroll"><label className="pg-field">練習・試合のメモ名<Input maxLength={100} placeholder="例：射撃場5分 + Ascentを2試合" value={label} onChange={e => setLabel(e.target.value)} disabled={saving} /></label><div className="pg-editor-grid">{PLAYER_SKILLS.map((skill, i) => <label key={skill.id}><span>{String(i + 1).padStart(2, "0")} · {skill.label}</span><small>{skill.check}</small><NativeSelect aria-label={`${skill.label}の自己評価`} value={draft[skill.id] || 0} onChange={e => setDraft(current => ({ ...current, [skill.id]: Number(e.target.value) }))} disabled={saving}>{LEVEL_LABELS.map((text, value) => <NativeSelectOption value={value} key={value}>{text}</NativeSelectOption>)}</NativeSelect></label>)}</div><label className="pg-field">気づいたこと・次に試すこと<Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="例：頭の高さは保てた。近い角で照準が壁に寄りすぎるので次回確認する。" disabled={saving} /></label></div>{saveError ? <p role="alert" className="pg-alert">{saveError}</p> : null}<div className="pg-editor-actions"><span>{Object.values(draft).filter(value => value > 0).length} / 12項目を評価</span><Button type="button" variant="outline" disabled={saving} onClick={() => setEditorOpen(false)}>戻る</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <Check />}{saving ? "保存中…" : "成長グラフに保存"}</Button></div></form>
      </DialogContent>
    </Dialog>
  </section>;
}
