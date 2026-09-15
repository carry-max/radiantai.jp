export type TrainingVideoMode = "aim" | "tactics";

export const VALORANT_RANKS = [
  "アイアン", "ブロンズ", "シルバー", "ゴールド", "プラチナ",
  "ダイヤ", "アセンダント", "イモータル", "レディアント",
] as const;

export type ValorantRank = (typeof VALORANT_RANKS)[number];

export type TrainingVideo = {
  videoId: string;
  rank: number;
  targetRank: ValorantRank;
  mode: TrainingVideoMode;
  title: string;
  creator: string;
  url: string;
  level: string;
  summary: string;
  skills: string[];
  keywords: string[];
};

export const TRAINING_VIDEOS: TrainingVideo[] = [
  {
    videoId: "lrDr63WS1hA", rank: 1, targetRank: "アイアン", mode: "tactics",
    title: "ゲーム理解度が変わる！基礎の基礎を解説", creator: "YamatoN",
    url: "https://www.youtube.com/watch?v=lrDr63WS1hA", level: "まずはここから",
    summary: "ルール、勝ち方、ラウンドの流れを整理し、試合中に何を目指すべきかを理解できます。",
    skills: ["基本ルール", "勝利条件", "ゲーム理解"], keywords: ["ルール", "基礎", "勝利条件", "ラウンド", "初心者", "判断"],
  },
  {
    videoId: "yMWM_pRv-Lo", rank: 2, targetRank: "ブロンズ", mode: "aim",
    title: "アイアン・ブロンズ帯を最速で抜け出す為の5つの上達ポイント", creator: "SmashlogTV - VALORANT",
    url: "https://www.youtube.com/watch?v=yMWM_pRv-Lo", level: "基礎を安定させる",
    summary: "クロスヘア、ストッピング、味方のカバー、バイなど、ランクを上げる土台をまとめて確認できます。",
    skills: ["ストッピング", "クロスヘア", "カバーとバイ"], keywords: ["ストッピング", "クロスヘア", "カバー", "バイ", "基礎", "撃ち合い"],
  },
  {
    videoId: "4VASyxOuGy0", rank: 3, targetRank: "シルバー", mode: "aim",
    title: "ゴールド以下専用・超効率よく上達するエイム練習メニュー", creator: "FIR 【VALORANT攻略】",
    url: "https://www.youtube.com/watch?v=4VASyxOuGy0", level: "AIMの型を作る",
    summary: "練習の目的と手順を決め、短い時間でも実戦につながるAIMの基礎を反復できます。",
    skills: ["AIM練習", "反復メニュー", "基礎フィジカル"], keywords: ["AIM", "練習", "フリック", "精度", "ルーティン", "撃ち合い"],
  },
  {
    videoId: "-3jpSLiL4nI", rank: 4, targetRank: "ゴールド", mode: "aim",
    title: "ゴールド・シルバーでスタックする人が集中すべき2つのこと", creator: "gosiofps解説",
    url: "https://www.youtube.com/watch?v=-3jpSLiL4nI", level: "撃ち合いを安定させる",
    summary: "視点移動とクロスヘア位置に集中し、毎回の撃ち合いで起きる大きなズレを減らせます。",
    skills: ["視点移動", "クロスヘア位置", "撃ち合いの安定"], keywords: ["視点移動", "クロスヘア", "照準", "撃ち合い", "修正", "安定"],
  },
  {
    videoId: "XY8NZULxt44", rank: 5, targetRank: "プラチナ", mode: "aim",
    title: "初心者からダイヤ帯まで最速で上がるためにやるべきこと", creator: "gosiofps解説",
    url: "https://www.youtube.com/watch?v=XY8NZULxt44", level: "動きと照準をつなぐ",
    summary: "壁を使った移動、ピーク、クリアリング、マウス操作をつなげて、実戦で再現できる形に整えます。",
    skills: ["壁とピーク", "クリアリング", "マウス操作"], keywords: ["壁", "ピーク", "クリアリング", "マウス", "クロスヘア", "練習"],
  },
  {
    videoId: "g2oCcLiFZoo", rank: 6, targetRank: "ダイヤ", mode: "tactics",
    title: "ダイヤ・アセ帯を抜けるために確認したい4つのこと", creator: "gosiofps解説",
    url: "https://www.youtube.com/watch?v=g2oCcLiFZoo", level: "判断の質を上げる",
    summary: "撃ち合いだけでは差がつきにくい帯で、判断、動き方、再現性を一段上げる改善点を確認できます。",
    skills: ["判断", "立ち回り", "再現性"], keywords: ["判断", "立ち回り", "ダイヤ", "アセンダント", "改善", "再現性"],
  },
  {
    videoId: "JVHpDjHpkJ4", rank: 7, targetRank: "アセンダント", mode: "aim",
    title: "イモータルまでに必要な撃ち合い方がすべて学べる", creator: "まどろむ【いも筋 TV】",
    url: "https://www.youtube.com/watch?v=JVHpDjHpkJ4", level: "有利な撃ち合いを作る",
    summary: "プリエイム、壁との距離、オフアングル、ピークを組み合わせ、上位帯で通用する撃ち合いを学べます。",
    skills: ["プリエイム", "遠近壁", "オフアングル"], keywords: ["プリエイム", "壁", "オフアングル", "ピーク", "撃ち合い", "間合い"],
  },
  {
    videoId: "_N2a1pPmX24", rank: 8, targetRank: "イモータル", mode: "tactics",
    title: "攻めで必要なすべての知識が手に入る", creator: "まどろむ【いも筋 TV】",
    url: "https://www.youtube.com/watch?v=_N2a1pPmX24", level: "ラウンドを組み立てる",
    summary: "攻めの情報取りからエリア確保、サイトへの入り方まで、ラウンド全体を組み立てる視点を学べます。",
    skills: ["攻撃マクロ", "エリア管理", "ラウンド構築"], keywords: ["攻め", "マクロ", "エリア", "情報", "ラウンド", "サイト", "ローテ"],
  },
  {
    videoId: "nRvGeG3bAeI", rank: 9, targetRank: "レディアント", mode: "tactics",
    title: "イモータル・レディアントのようなピークをマスターする方法", creator: "gosiofps解説",
    url: "https://www.youtube.com/watch?v=nRvGeG3bAeI", level: "細部を最適化する",
    summary: "接敵時の選択とピークの細部を見直し、小さな不利を減らして判断精度を高めます。",
    skills: ["高度なピーク", "接敵判断", "動きの最適化"], keywords: ["ピーク", "接敵", "判断", "イモータル", "レディアント", "最適化", "角度"],
  },
];

export function videosForMode(mode: TrainingVideoMode) {
  return TRAINING_VIDEOS.filter((video) => video.mode === mode).sort((a, b) => a.rank - b.rank);
}

export function videosForRank(targetRank: ValorantRank) {
  return TRAINING_VIDEOS.filter((video) => video.targetRank === targetRank).sort((a, b) => a.rank - b.rank);
}

export function recommendTrainingVideos(mode: TrainingVideoMode, reviewText: string, limit = 3) {
  const normalized = reviewText.toLowerCase();
  return videosForMode(mode)
    .map((video) => ({ video, score: video.keywords.reduce((total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.video.rank - b.video.rank)
    .slice(0, limit)
    .map(({ video }) => video);
}
