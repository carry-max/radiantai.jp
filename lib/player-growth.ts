export const PLAYER_SKILLS = [
  { id: "aim", label: "エイム", short: "AIM", group: "撃ち合い", ai: false,
    description: "初弾の精度、フリック後の微調整、バーストの制御。速さより、狙った場所に当てる再現性を確認します。",
    drill: "射撃場で頭に合わせて1発ずつ撃つ練習を5分。同じ武器・距離で10回行い、初弾が当たった回数をメモする。",
    check: "焦って撃たず、狙いを合わせてから発砲できたか。" },
  { id: "crosshair", label: "クロスヘア配置", short: "CROSSHAIR", group: "撃ち合い", ai: true,
    description: "敵が出てくる位置と頭の高さに照準を置き、接敵後の大きな修正を減らします。高低差も考慮します。",
    drill: "カスタムで1ルートを歩き、角を曲がるたびに想定する頭の高さと出現位置に照準を置く。接敵前の録画を5場面確認する。",
    check: "接敵する前から照準が頭の高さ・想定位置にあったか。" },
  { id: "peeking", label: "ピーク技術", short: "PEEKING", group: "撃ち合い", ai: true,
    description: "情報を取るピークと撃ち合うピークを使い分けます。出る幅、退路、味方とのタイミングを確認します。",
    drill: "カスタムで同じ角から、情報を取って戻る動きと、敵の位置を決めて撃つ動きを各10回。目的と出る幅を比べる。",
    check: "何を確認・攻撃するピークかを決め、不要な再ピークを避けたか。" },
  { id: "peek_advantage", label: "ピークアドバンテージ", short: "PEEK ADV.", group: "撃ち合い", ai: false,
    description: "動き出す側と待つ側の見え方の差を理解し、角度・距離・予測されやすさを考えて戦います。通信遅延の優位そのものを能力点にはしません。",
    drill: "協力者とカスタムで出る側・待つ側を交代。同じ角と違う距離を試し、両視点の録画から見え方と照準の置き方を比べる。",
    check: "回線だけで勝敗を説明せず、待つ位置・距離・予測可能性を説明できるか。" },
  { id: "movement", label: "ストッピング", short: "MOVEMENT", group: "撃ち合い", ai: false,
    description: "移動から射撃への切り替え、撃った後の移動、不要なしゃがみを見直します。停止の瞬間は連続映像で確認します。",
    drill: "射撃場で左右移動→停止→短いバーストを10回。射撃エラー表示や録画で、移動中の発砲を確認する。",
    check: "狙った射撃で移動誤差を抑え、撃った後に安全な位置へ動けたか。" },
  { id: "angles", label: "射線管理", short: "ANGLES", group: "生存・連携", ai: true,
    description: "複数方向から同時に撃たれないよう、遮蔽を使って確認する角を絞ります。",
    drill: "よく入るサイトを1つ選び、遮蔽を使って角を1つずつ確認。露出した瞬間に未確認の射線が何本あったか見直す。",
    check: "確認していない複数の射線に同時に体を出していなかったか。" },
  { id: "positioning", label: "ポジショニング", short: "POSITION", group: "生存・連携", ai: true,
    description: "遮蔽、退路、人数差、役割に合う立ち位置を選びます。キル後や位置が知られた後の移動も対象です。",
    drill: "デス前の場面を3つ選び、使えた遮蔽と退路を1つずつ挙げる。次の試合では退路を決めてから接敵する。",
    check: "接敵位置に遮蔽と退路があり、そのラウンドの役割に合っていたか。" },
  { id: "trade", label: "トレード・連携", short: "TEAMPLAY", group: "生存・連携", ai: true,
    description: "味方が接敵したときに反応できる距離・射線を保ち、同じタイミングで圧力をかけます。",
    drill: "味方に続く場面を3つ確認。味方が撃たれた位置に自分の射線が通るか、障害物と間隔をチェックする。",
    check: "味方の接敵に参加できる位置だったか。単独で先に出ていなかったか。" },
  { id: "utility", label: "スキル運用", short: "UTILITY", group: "判断・再現性", ai: true,
    description: "索敵・遮断・妨害など、アビリティーの目的と味方が使えるタイミングを合わせます。",
    drill: "使用したスキルを3回振り返り、目的・得られた情報・味方が活用できたかを1行ずつ書く。",
    check: "スキルが目的に合っていたか。安全に使え、次の行動につながったか。" },
  { id: "awareness", label: "情報判断", short: "INFORMATION", group: "判断・再現性", ai: true,
    description: "ミニマップ、確認できた敵、人数、スパイクなどを整理します。推測と確定情報を分けます。",
    drill: "録画を接敵前で止め、確定している情報と未確認の情報を分けて書く。その情報で次の行動を説明する。",
    check: "画面で分かる情報を踏まえ、分からない敵位置を決めつけなかったか。" },
  { id: "round_decisions", label: "ラウンド判断", short: "DECISIONS", group: "判断・再現性", ai: true,
    description: "残り時間・人数・スパイク・装備を踏まえ、戦う、待つ、寄る、退く判断を選びます。購入と味方の装備合わせも見直します。",
    drill: "負けたラウンドを1つ選び、選べた別の行動を2つ挙げる。時間・人数・装備のどれを優先すべきだったか書く。",
    check: "目の前のキルだけでなく、ラウンドを取る条件に合う行動だったか。" },
  { id: "consistency", label: "再現性・修正力", short: "CONSISTENCY", group: "判断・再現性", ai: false,
    description: "決めた課題を別の試合でも実行し、失敗後に立て直します。1回の成功で定着したとは判断しません。",
    drill: "今日の課題を1つに絞って3試合記録。実行できた場面とできなかった場面を残し、次回の課題を調整する。",
    check: "別の試合でも同じ行動を再現し、崩れたときに修正できたか。" },
] as const;

export type PlayerSkillId = typeof PLAYER_SKILLS[number]["id"];
export type GrowthSource = "self" | "ai";
export type SkillRating = { skill: PlayerSkillId; level: number; evidence: string; times: number[] };
export type PlayerGrowthRecord = { id: string; source: GrowthSource; recordedAt: string; label: string; note: string; ratings: SkillRating[] };
export const LEVEL_LABELS = ["未評価", "1 · 基礎を確認", "2 · 意識するとできる", "3 · この条件でできる", "4 · 安定してできる", "5 · 条件が変わっても再現"];

export function verifiedSkillRatings(value: unknown, frameTimes: number[], reviewOk: boolean, mode: "tactics" | "aim" = "tactics"): SkillRating[] {
  if (!reviewOk || !Array.isArray(value)) return [];
  const used = new Set<string>();
  return value.flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const skill = PLAYER_SKILLS.find(s => s.id === item.skill);
    if (!skill || !(mode === "aim" ? skill.id === "aim" || skill.id === "crosshair" : skill.ai) || used.has(skill.id) || !Number.isInteger(item.level) || Number(item.level) < 1 || Number(item.level) > 3) return [];
    if (typeof item.evidence !== "string" || !item.evidence.trim() || item.evidence.length > 500 || !Array.isArray(item.times) || !item.times.length || item.times.length > 6) return [];
    if (!item.times.every(t => typeof t === "number" && Number.isFinite(t) && frameTimes.some(input => Math.abs(input - t) < 0.01))) return [];
    const times = [...new Set((item.times as number[]).map(t => frameTimes.find(input => Math.abs(input - t) < 0.01)!))];
    if (skill.id === "aim" && times.length < 3) return [];
    used.add(skill.id);
    return [{ skill: skill.id, level: Number(item.level), evidence: item.evidence.trim(), times }];
  }).slice(0, 8);
}

export function growthComparison(records: PlayerGrowthRecord[], source: GrowthSource, days: number, now: number) {
  const cutoff = now - days * 86400000;
  const previousCutoff = cutoff - days * 86400000;
  const selected = records.filter(r => r.source === source && Date.parse(r.recordedAt) <= now);
  const current = selected.filter(r => Date.parse(r.recordedAt) > cutoff);
  const previous = selected.filter(r => Date.parse(r.recordedAt) > previousCutoff && Date.parse(r.recordedAt) <= cutoff);
  const aggregate = (list: PlayerGrowthRecord[], id: PlayerSkillId) => {
    const ratings = list.flatMap(r => r.ratings.filter(rating => rating.skill === id));
    return { value: ratings.length ? Math.round(ratings.reduce((sum, r) => sum + r.level * 20, 0) / ratings.length) : null, count: ratings.length };
  };
  return { current, previous, axes: PLAYER_SKILLS.map(skill => ({ ...skill, current: aggregate(current, skill.id), previous: aggregate(previous, skill.id) })) };
}

export const SKILL_ASSESSMENT_SCHEMA = {
  type: "array", items: { type: "object", properties: {
    skill: { type: "string", enum: PLAYER_SKILLS.filter(s => s.ai).map(s => s.id) },
    level: { type: "integer", enum: [1, 2, 3] },
    evidence: { type: "string" }, times: { type: "array", items: { type: "number" } },
  }, required: ["skill", "level", "evidence", "times"], additionalProperties: false },
};
export const SKILL_ASSESSMENT_INSTRUCTIONS = `\n成長グラフ用のskill_assessmentsを出力してください。静止画で直接確認できる項目だけを含め、未確認の項目は省略します。対象: ${PLAYER_SKILLS.filter(s => s.ai).map(s => `${s.id}=${s.label}`).join("、")}。
各項目はlevel=1（基礎の修正が必要）、2（一部できている）、3（この場面の条件でできている）で判定します。安定性・定着は一場面で測れないため4・5は使いません。レベルはランクや勝率の予測ではありません。
evidenceは入力に写る具体的事実、timesはその入力フレームの時刻をそのまま記します。情報判断やラウンド判断は必要な人数・時間等が読み取れる場合だけ評価します。ピークは露出と目的が確認できる範囲に限り、動作速度や射撃停止の精度は評価しません。エイム精度、ストッピング、通信のピークアドバンテージ、長期再現性は静止画では測れないため出力しません。最大8項目、根拠不足なら空配列。`;
