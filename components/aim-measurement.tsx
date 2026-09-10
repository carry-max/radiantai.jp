"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { Crosshair, RotateCcw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { preciseTime, targetOffset, type AimPoint } from "@/lib/review-modes";

type AimFrame = { time: number; dataUrl: string; label: string };
type Mark = { target?: AimPoint; crosshair?: AimPoint };
export function AimMeasurement({ frames }: { frames: AimFrame[] }) {
  const [selected, setSelected] = useState(0);
  const [kind, setKind] = useState<"target" | "crosshair">("target");
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [aspects, setAspects] = useState<Record<number, number>>({});
  const frame = frames[selected];
  const mark = marks[selected] || {};
  const points = useMemo(() => frames.map((frame, i) => ({ time: frame.time, offset: marks[i]?.target && marks[i]?.crosshair && aspects[i] ? targetOffset(marks[i].target!, marks[i].crosshair!, aspects[i]) : null })), [frames, marks, aspects]);
  const complete = points.filter(p => p.offset !== null);
  const max = Math.max(5, ...complete.map(p => p.offset!.distance));
  if (!frame) return null;
  return <details className="aim-measurement"><summary><Target /> 照準と敵のズレを自分で確かめる <span>任意・端末内・無料</span></summary>
    <p>同じ敵の頭の中心と、照準の中心を各画像に指定すると、画像上の距離を計算します。見えない画像は空欄のままにしてください。AIの判定とは別の確認用で、点の位置は送信・保存しません。</p>
    <div className="aim-frame-tabs" role="group" aria-label="測定する画像">{frames.map((item, i) => <button type="button" key={item.time} aria-pressed={selected === i} onClick={() => { setSelected(i); setKind("target"); }}>{i + 1}<small>{item.label}</small></button>)}</div>
    <div className="aim-mark-tools"><Button variant={kind === "target" ? "default" : "outline"} size="sm" onClick={() => setKind("target")}><Target /> 敵の頭</Button><Button variant={kind === "crosshair" ? "default" : "outline"} size="sm" onClick={() => setKind("crosshair")}><Crosshair /> 照準の中心</Button><Button variant="ghost" size="sm" onClick={() => setMarks(current => ({ ...current, [selected]: {} }))}><RotateCcw /> この画像を消去</Button></div>
    <div className="aim-mark-image" onPointerDown={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      const p = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
      setMarks(current => ({ ...current, [selected]: { ...current[selected], [kind]: p } }));
      if (kind === "target") setKind("crosshair");
    }}><img draggable={false} src={frame.dataUrl} alt={`${preciseTime(frame.time)}。下の数値入力でも位置を指定できます。`} onLoad={e => { const img = e.currentTarget; setAspects(current => ({ ...current, [selected]: img.naturalWidth / img.naturalHeight })); }} />
      {mark.target ? <span className="aim-mark target" style={{ left: `${mark.target.x * 100}%`, top: `${mark.target.y * 100}%` }}>T</span> : null}{mark.crosshair ? <span className="aim-mark crosshair" style={{ left: `${mark.crosshair.x * 100}%`, top: `${mark.crosshair.y * 100}%` }}>+</span> : null}
    </div>
    <p className="aim-mark-hint">{kind === "target" ? "敵の頭の中心" : "照準の中心"}をクリック・タップ。現在の画像：{preciseTime(frame.time)}</p>
    <details className="aim-coordinates"><summary>位置を数値で指定（画像の左上が0%、右下が100%）</summary><div>{(["target", "crosshair"] as const).flatMap(type => (["x", "y"] as const).map(axis => <label key={`${type}-${axis}`}>{type === "target" ? "頭" : "照準"} {axis.toUpperCase()}<input type="number" min="0" max="100" step="0.1" value={mark[type] ? Number((mark[type]![axis] * 100).toFixed(1)) : ""} onChange={e => { const n = Number(e.target.value); if (!e.target.value || !Number.isFinite(n) || n < 0 || n > 100) return; setMarks(current => ({ ...current, [selected]: { ...current[selected], [type]: { ...(current[selected]?.[type] || { x: .5, y: .5 }), [axis]: n / 100 } } })); }} /></label>))}</div></details>
    {complete.length ? <div className="aim-offset-chart"><strong>頭と照準の距離 <small>画像の高さに対する% · {complete.length}/6枚を指定</small></strong><svg viewBox="0 0 500 145" role="img" aria-label="指定した頭と照準の画像上の距離の推移。低いほど2点が近い状態です。">
      {[0, .5, 1].map(t => <g key={t}><line x1="40" x2="475" y1={115 - t * 90} y2={115 - t * 90} stroke="#293b45" /><text x="0" y={119 - t * 90} fill="#8fa9b2" fontSize="10">{(max * t).toFixed(1)}%</text></g>)}
      {points.map((p, i) => { if (!p.offset) return null; const x = 40 + (p.time - frames[0].time) / (frames.at(-1)!.time - frames[0].time) * 435; const y = 115 - p.offset.distance / max * 90; const prior = points[i - 1]; return <g key={p.time}>{prior?.offset ? <line x1={40 + (prior.time - frames[0].time) / (frames.at(-1)!.time - frames[0].time) * 435} y1={115 - prior.offset.distance / max * 90} x2={x} y2={y} stroke="#71e4b6" strokeWidth="2" /> : null}<circle cx={x} cy={y} r="4" fill="#71e4b6" /><text x={x} y="140" fill="#8fa9b2" fontSize="10" textAnchor="middle">{i + 1}</text></g>; })}
    </svg><div className="aim-offset-values">{points.map((p, i) => <span key={p.time}>{i + 1}枚目 <b>{p.offset ? `${p.offset.distance.toFixed(1)}%` : "未指定"}</b></span>)}</div><p>指定位置に誤差があります。これは選んだ画像内の相対距離で、命中率・反応速度・マウスの移動量ではありません。別の敵・拡大率・距離の異なる場面の数値は直接比較しません。</p></div> : null}
  </details>;
}
