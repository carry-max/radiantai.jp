export type TrainingVideoMode = "aim" | "tactics";

export type TrainingVideo = {
  videoId: string;
  rank: number;
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
    videoId: "1vKfPS0OlGA",
    rank: 1,
    mode: "aim",
    title: "An Updated Crosshair Placement Guide for 2024",
    creator: "Konpeki",
    url: "https://www.youtube.com/watch?v=1vKfPS0OlGA",
    level: "全ランク",
    summary: "敵が出る前の照準位置を整え、大きなフリックを減らす考え方と練習方法を学べます。",
    skills: ["クロスヘアプレイスメント", "照準の高さ", "プリエイム"],
    keywords: ["クロスヘア", "照準", "初期位置", "高さ", "プリエイム", "大きな修正"],
  },
  {
    videoId: "fJ5ClU3EzWc",
    rank: 2,
    mode: "aim",
    title: "Your Movement is the Real Problem | Gunfight Hygiene",
    creator: "Woohoojin",
    url: "https://www.youtube.com/watch?v=fJ5ClU3EzWc",
    level: "初級〜中級",
    summary: "撃つ瞬間の停止、バースト、横移動を整理し、AIMが崩れる原因を動きから直します。",
    skills: ["ストッピング", "撃ち方", "移動と射撃"],
    keywords: ["ストッピング", "移動", "撃ち方", "バースト", "静止", "ブレ", "ピーク"],
  },
  {
    videoId: "JxP2y_q51IE",
    rank: 3,
    mode: "aim",
    title: "Updated Gold Aim & Mechanics Routine",
    creator: "Woohoojin",
    url: "https://www.youtube.com/watch?v=JxP2y_q51IE",
    level: "初級〜中級",
    summary: "レンジとデスマッチを使い、毎日再現できるAIM・メカニクス練習の流れを作れます。",
    skills: ["練習ルーティン", "マイクロ調整", "デスマッチ"],
    keywords: ["小さな修正", "マイクロ", "フリック", "練習", "ルーティン", "デスマッチ", "追いAIM"],
  },
  {
    videoId: "KwCzQmSx-p0",
    rank: 4,
    mode: "aim",
    title: "Every mistake you make when aim training",
    creator: "Viscose",
    url: "https://www.youtube.com/watch?v=KwCzQmSx-p0",
    level: "中級〜上級",
    summary: "課題に合わないシナリオや惰性の反復を避け、弱点に合わせて練習を選ぶ方法を学べます。",
    skills: ["課題別AIM練習", "精度", "振り返り"],
    keywords: ["精度", "追いAIM", "フリック", "反応", "感度", "エイムトレーナー", "弱点"],
  },
  {
    videoId: "b1X3YuT_ruk",
    rank: 1,
    mode: "tactics",
    title: "Why You Suck at Peeking (and how to fix it)",
    creator: "Konpeki",
    url: "https://www.youtube.com/watch?v=b1X3YuT_ruk",
    level: "全ランク",
    summary: "不利なピークで即座に倒される原因を分け、勝ちやすい出方と生存率を高める方法を学べます。",
    skills: ["ピークの仕方", "射線管理", "生存率"],
    keywords: ["ピーク", "射線", "角度", "生存", "遮蔽", "クリアリング", "デス"],
  },
  {
    videoId: "bv6V9hoL8TY",
    rank: 2,
    mode: "tactics",
    title: "This is why you suck at Peeking (and how to fix it)",
    creator: "royalG",
    url: "https://www.youtube.com/watch?v=bv6V9hoL8TY",
    level: "初級〜中級",
    summary: "相手視点、角度、Tルール、1対1の作り方から、ピークアドバンテージを実戦的に理解できます。",
    skills: ["ピークアドバンテージ", "角度", "1対1の分離"],
    keywords: ["ピークアドバンテージ", "ピーク", "角度", "1対1", "分離", "相手視点", "オフアングル"],
  },
  {
    videoId: "dLe9RHcFo2E",
    rank: 3,
    mode: "tactics",
    title: "IMPROVE GAMESENSE FAST! (NO BS)",
    creator: "Sero",
    url: "https://www.youtube.com/watch?v=dLe9RHcFo2E",
    level: "全ランク",
    summary: "自己レビュー、マップ知識、判断、ローテーションを結びつけ、立ち回りを改善します。",
    skills: ["ゲームセンス", "ローテーション", "判断"],
    keywords: ["判断", "情報", "ローテ", "マップ", "立ち回り", "タイミング", "味方", "人数"],
  },
  {
    videoId: "nJqYzX92hNU",
    rank: 4,
    mode: "tactics",
    title: "My Movement Advice for every Rank in Valorant",
    creator: "Konpeki",
    url: "https://www.youtube.com/watch?v=nJqYzX92hNU",
    level: "ランク別",
    summary: "ランクごとに優先すべき移動技術を確認し、実力に合う一つの課題へ絞れます。",
    skills: ["ムーブメント", "ランク別課題", "接敵準備"],
    keywords: ["移動", "ムーブメント", "接敵", "ランク", "止まり方", "切り返し", "ポジション"],
  },
];

export function videosForMode(mode: TrainingVideoMode) {
  return TRAINING_VIDEOS.filter((video) => video.mode === mode).sort((a, b) => a.rank - b.rank);
}

export function recommendTrainingVideos(mode: TrainingVideoMode, reviewText: string, limit = 3) {
  const normalized = reviewText.toLowerCase();

  return videosForMode(mode)
    .map((video) => ({
      video,
      score: video.keywords.reduce(
        (total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.video.rank - b.video.rank)
    .slice(0, limit)
    .map(({ video }) => video);
}
