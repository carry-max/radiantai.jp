import { useEffect, useState } from "react";
import type { ClipRecord, DesktopSnapshot, ReplayRecord } from "./contracts";

const previewSnapshot: DesktopSnapshot = {
  runtime: "browser-preview",
  version: "0.1.0",
  phase: "game_detected",
  recorder: "buffering",
  native: "ready",
  valorantDetected: true,
  gameName: "VALORANT",
  matchId: "preview-match",
  kills: 12,
  deaths: 7,
  account: { signedIn: false, riotLinked: false },
  lastMessage: "VALORANTを検出しました。自動クリップは待機中です。",
  clips: [
    { id: "preview-1", path: "", fileName: "death-01.mp4", capturedAt: new Date().toISOString(), beforeSeconds: 25, afterSeconds: 5, matchId: "preview", deathIndex: 1, sizeBytes: 18_400_000, durationMs: 30_000, analysisPhase: "local" },
  ],
  replays: [],
};

function formatSize(bytes: number) {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;
}

function phaseLabel(phase: ClipRecord["analysisPhase"] | ReplayRecord["analysisPhase"]) {
  return { local: "端末内", uploading: "送信中", analyzing: "AI解析中", complete: "解析済み", error: "要確認" }[phase];
}

export function App() {
  const [snapshot, setSnapshot] = useState<DesktopSnapshot>(previewSnapshot);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const api = window.radiant;

  useEffect(() => {
    if (!api) return;
    void api.getSnapshot().then(setSnapshot);
    return api.subscribe(setSnapshot);
  }, [api]);

  const status = (() => {
    if (snapshot.recorder === "unavailable") return { tone: "warn", label: "録画機能を準備できません" };
    if (snapshot.recorder === "capturing") return { tone: "live", label: "デスクリップを保存中" };
    if (snapshot.recorder === "buffering") return { tone: "ready", label: "自動クリップ待機中" };
    return { tone: "idle", label: "VALORANTの起動待ち" };
  })();

  const signIn = async () => {
    if (!api) return;
    const account = await api.openLogin();
    setNotice(account.signedIn ? `${account.name || "アカウント"}でログインしました。` : "ログインを確認できませんでした。");
  };

  const chooseReplay = async () => {
    if (!api) return;
    setBusyId("replay-picker");
    try { await api.chooseReplay(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "リプレイを読み込めませんでした。"); }
    finally { setBusyId(""); }
  };

  const analyzeClip = async (clip: ClipRecord) => {
    if (!api) return;
    setBusyId(clip.id); setNotice("");
    try { await api.analyzeClip(clip.id); setNotice("ミクロ解析が完了しました。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "ミクロ解析に失敗しました。"); }
    finally { setBusyId(""); }
  };

  const analyzeReplay = async (replay: ReplayRecord) => {
    if (!api) return;
    setBusyId(replay.id); setNotice("");
    try { await api.analyzeReplay(replay.id); setNotice("リプレイ解析が完了しました。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "リプレイ解析に失敗しました。"); }
    finally { setBusyId(""); }
  };

  return <div className="app-shell">
    <header className="titlebar">
      <div className="brand"><span className="brand-mark"><i /></span><span><strong>RADIANTAI</strong><small>WINDOWS</small></span></div>
      <div className="titlebar-status"><span className={`status-dot ${status.tone}`} />{status.label}</div>
      <button className="account-button" onClick={() => void signIn()}>{snapshot.account.signedIn ? snapshot.account.name || "アカウント" : "ログイン"}</button>
    </header>

    <main>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">VALORANT POST-MATCH CAPTURE</p>
          <h1>試合中は保存だけ。<br /><span>解析は試合後。</span></h1>
          <p>Deathを検出すると、死亡前25秒＋死亡後5秒を自動保存します。試合中にAIの助言や画面表示は行いません。</p>
          <div className="hero-actions"><button className="primary" onClick={() => void chooseReplay()} disabled={!api || busyId === "replay-picker"}>{busyId === "replay-picker" ? "読み込み中…" : "リプレイを選ぶ"}</button><button onClick={() => void api?.openClipFolder()}>保存先を開く</button></div>
        </div>
        <div className="game-monitor">
          <div className="monitor-top"><span className={`status-dot ${status.tone}`} /><small>LIVE STATUS</small><em>{snapshot.runtime === "ow-electron" ? "OVERWOLF" : "PREVIEW"}</em></div>
          <strong>{snapshot.valorantDetected ? "VALORANT 検出済み" : "VALORANT 起動待ち"}</strong>
          <p>{snapshot.lastMessage}</p>
          <div className="match-stats"><div><small>KILL</small><b>{snapshot.kills}</b></div><div><small>DEATH</small><b>{snapshot.deaths}</b></div><div><small>CLIP</small><b>{snapshot.clips.length}</b></div></div>
          <div className="service-row"><span className={snapshot.recorder === "buffering" ? "ok" : ""}>Overwolf Recorder</span><span className={snapshot.native === "ready" ? "ok" : "warn"}>Rust + FFmpeg</span></div>
        </div>
      </section>

      <section className="flow-panel" aria-label="処理の流れ">
        <div><small>01</small><strong>Overwolf</strong><span>起動・Kill・Death検出</span></div><i>→</i><div><small>02</small><strong>自動クリップ</strong><span>25秒前＋5秒後</span></div><i>→</i><div><small>03</small><strong>Rust / FFmpeg</strong><span>ローカル前処理</span></div><i>→</i><div><small>04</small><strong>RadiantAI API</strong><span>Supabase → AI解析</span></div>
      </section>

      {notice ? <div className="notice" role="status">{notice}</div> : null}

      <div className="content-grid">
        <section className="content-panel">
          <div className="section-heading"><div><p className="eyebrow">MICRO / DEATH CLIPS</p><h2>デスクリップ</h2></div><span>{snapshot.clips.length}件</span></div>
          {snapshot.clips.length ? <div className="item-list">{snapshot.clips.map(clip => <article className="clip-card" key={clip.id}>
            <div className="clip-index">D{String(clip.deathIndex).padStart(2, "0")}</div>
            <div className="clip-copy"><strong>{clip.fileName}</strong><span>{new Date(clip.capturedAt).toLocaleString("ja-JP")} · {formatSize(clip.sizeBytes)} · 30秒</span><small className={`phase ${clip.analysisPhase}`}>{phaseLabel(clip.analysisPhase)}</small></div>
            <button className="primary small" disabled={!api || busyId === clip.id || clip.analysisPhase === "complete"} onClick={() => void analyzeClip(clip)}>{busyId === clip.id ? "処理中…" : clip.analysisPhase === "complete" ? "解析済み" : "ミクロ解析"}</button>
          </article>)}</div> : <div className="empty"><strong>まだクリップはありません</strong><span>VALORANTを起動すると自動保存が始まります。</span></div>}
        </section>

        <section className="content-panel">
          <div className="section-heading"><div><p className="eyebrow">TACTICS / REPLAY</p><h2>選んだリプレイ</h2></div><button className="text-button" onClick={() => void chooseReplay()}>＋ 追加</button></div>
          {snapshot.replays.length ? <div className="item-list">{snapshot.replays.map(replay => <article className="clip-card" key={replay.id}>
            <div className="clip-index replay">R</div>
            <div className="clip-copy"><strong>{replay.fileName}</strong><span>{Math.round(replay.durationMs / 1000)}秒 · {replay.width}×{replay.height} · {formatSize(replay.sizeBytes)}</span><small className={`phase ${replay.analysisPhase}`}>{phaseLabel(replay.analysisPhase)}</small></div>
            <button className="primary small" disabled={!api || busyId === replay.id || replay.analysisPhase === "complete"} onClick={() => void analyzeReplay(replay)}>{busyId === replay.id ? "処理中…" : replay.analysisPhase === "complete" ? "解析済み" : "立ち回り解析"}</button>
          </article>)}</div> : <div className="empty"><strong>確認したいリプレイを選択</strong><span>重いフレーム抽出はRustワーカーが端末内で処理します。</span><button onClick={() => void chooseReplay()}>リプレイを選ぶ</button></div>}
        </section>
      </div>

      <footer><span>映像は端末へ保存</span><div><p>解析を実行したクリップだけを非公開Storageへ一時送信します。APIキーはアプリに保存しません。</p><p className="riot-disclaimer">RadiantAI isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p></div><small>RadiantAI Windows {snapshot.version}</small></footer>
    </main>
  </div>;
}
