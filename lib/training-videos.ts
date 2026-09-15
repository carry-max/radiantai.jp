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
  {
    videoId: "Smozh3gEFV4", rank: 10, targetRank: "ブロンズ", mode: "aim",
    title: "Lazが考える、実戦で使える正しいエイム練習法", creator: "Lazvell",
    url: "https://www.youtube.com/watch?v=Smozh3gEFV4", level: "練習の質を上げる",
    summary: "練習量だけに頼らず、実戦へつながるAIM練習の考え方と上達の基準を学べます。",
    skills: ["AIM練習", "実戦への応用", "練習基準"], keywords: ["練習", "ルーティン", "精度", "フリック", "追いAIM", "弱点"],
  },
  {
    videoId: "C5zvMC0eGbU", rank: 11, targetRank: "シルバー", mode: "aim",
    title: "プロがやっている究極のクロスヘアの置き方", creator: "GON",
    url: "https://www.youtube.com/watch?v=C5zvMC0eGbU", level: "初弾を速くする",
    summary: "敵が出る前の照準位置を整え、反応後の大きな修正を減らすクロスヘアの置き方を学べます。",
    skills: ["クロスヘア配置", "照準の高さ", "プリエイム"], keywords: ["クロスヘア", "照準", "初期位置", "高さ", "プリエイム", "修正"],
  },
  {
    videoId: "6cBCjvTOTyU", rank: 12, targetRank: "プラチナ", mode: "aim",
    title: "レディアント日本1位が教えるエイム・撃ち合いの強化法", creator: "たっと",
    url: "https://www.youtube.com/watch?v=6cBCjvTOTyU", level: "撃ち方を使い分ける",
    summary: "AIM単体に加えて、停止や撃ち方を含めた実戦的なメカニクスを整理できます。",
    skills: ["ストッピング", "バースト", "撃ち合い"], keywords: ["ストッピング", "移動", "撃ち方", "バースト", "静止", "ブレ", "ピーク"],
  },
  {
    videoId: "M5elbcHrHsY", rank: 13, targetRank: "アセンダント", mode: "aim",
    title: "yatsukaからAIMの考え方を教わるcrow", creator: "crowfps / yatsuka",
    url: "https://www.youtube.com/watch?v=M5elbcHrHsY", level: "照準修正を深める",
    summary: "競技選手同士の対話から、照準修正と撃ち合いで意識するポイントを深く学べます。",
    skills: ["AIMの思考", "照準修正", "振り返り"], keywords: ["小さな修正", "マイクロ", "フリック", "反応", "感度", "照準修正", "考え方"],
  },
  {
    videoId: "GTj5GTAkpj0", rank: 14, targetRank: "ゴールド", mode: "tactics",
    title: "初心者〜中級者向け・基本の強いピークの仕方", creator: "gosiofps解説",
    url: "https://www.youtube.com/watch?v=GTj5GTAkpj0", level: "ピークの型を覚える",
    summary: "よくある失敗、操作、プリエイムまで含め、勝ちやすいピークの基本を順序立てて学べます。",
    skills: ["ピーク", "プリエイム", "接敵準備"], keywords: ["ピーク", "射線", "角度", "遮蔽", "クリアリング", "プリエイム", "デス"],
  },
  {
    videoId: "3pgIpXnsz28", rank: 15, targetRank: "ダイヤ", mode: "tactics",
    title: "常に有利を作れるMeiy流ドライピーク", creator: "Meiy",
    url: "https://www.youtube.com/watch?v=3pgIpXnsz28", level: "有利な角度を作る",
    summary: "トッププロの実戦例から、スキルなしでも有利を作るピークと間合いを確認できます。",
    skills: ["ドライピーク", "ピーク有利", "間合い"], keywords: ["ピークアドバンテージ", "ピーク", "角度", "ドライ", "間合い", "相手視点", "オフアングル"],
  },
  {
    videoId: "_3IAzQk083c", rank: 16, targetRank: "ダイヤ", mode: "tactics",
    title: "撃ち合いの勝率を上げる立ち回り", creator: "たっと",
    url: "https://www.youtube.com/watch?v=_3IAzQk083c", level: "撃つ前に有利を作る",
    summary: "撃つ前の位置取りと判断を整え、同じAIMでも撃ち合いの勝率を上げる立ち回りを学べます。",
    skills: ["位置取り", "有利な条件", "判断"], keywords: ["判断", "情報", "立ち回り", "タイミング", "味方", "人数", "位置取り", "トレード"],
  },
  {
    videoId: "Nlo2NQPoztQ", rank: 17, targetRank: "イモータル", mode: "tactics",
    title: "セットアップ後に大切な守り方のプラン", creator: "Lazvell",
    url: "https://www.youtube.com/watch?v=Nlo2NQPoztQ", level: "守りのプランを持つ",
    summary: "守りのセットアップ後に、情報へ応じて判断し、無駄なデスを減らす考え方を学べます。",
    skills: ["守りのプラン", "情報判断", "生存"], keywords: ["守り", "セットアップ", "判断", "情報", "ローテ", "マップ", "生存", "スキル"],
  },
];

const RANK_VIDEO_IDS: Record<ValorantRank, readonly string[]> = {
  アイアン: ["lrDr63WS1hA", "yMWM_pRv-Lo", "Smozh3gEFV4", "C5zvMC0eGbU", "4VASyxOuGy0"],
  ブロンズ: ["yMWM_pRv-Lo", "C5zvMC0eGbU", "4VASyxOuGy0", "Smozh3gEFV4", "lrDr63WS1hA"],
  シルバー: ["4VASyxOuGy0", "C5zvMC0eGbU", "-3jpSLiL4nI", "Smozh3gEFV4", "yMWM_pRv-Lo"],
  ゴールド: ["-3jpSLiL4nI", "XY8NZULxt44", "GTj5GTAkpj0", "C5zvMC0eGbU", "4VASyxOuGy0"],
  プラチナ: ["XY8NZULxt44", "GTj5GTAkpj0", "6cBCjvTOTyU", "g2oCcLiFZoo", "C5zvMC0eGbU"],
  ダイヤ: ["g2oCcLiFZoo", "_3IAzQk083c", "3pgIpXnsz28", "JVHpDjHpkJ4", "6cBCjvTOTyU"],
  アセンダント: ["JVHpDjHpkJ4", "g2oCcLiFZoo", "3pgIpXnsz28", "M5elbcHrHsY", "nRvGeG3bAeI"],
  イモータル: ["_N2a1pPmX24", "JVHpDjHpkJ4", "nRvGeG3bAeI", "Nlo2NQPoztQ", "3pgIpXnsz28"],
  レディアント: ["nRvGeG3bAeI", "_N2a1pPmX24", "3pgIpXnsz28", "Nlo2NQPoztQ", "M5elbcHrHsY"],
};

const VIDEO_BY_ID = new Map(TRAINING_VIDEOS.map((video) => [video.videoId, video]));

export function videosForMode(mode: TrainingVideoMode) {
  return TRAINING_VIDEOS.filter((video) => video.mode === mode).sort((a, b) => a.rank - b.rank);
}

export function videosForRank(targetRank: ValorantRank) {
  return RANK_VIDEO_IDS[targetRank].map((videoId) => VIDEO_BY_ID.get(videoId)).filter((video): video is TrainingVideo => Boolean(video));
}

export function recommendTrainingVideos(mode: TrainingVideoMode, reviewText: string, limit = 3) {
  const normalized = reviewText.toLowerCase();
  return videosForMode(mode)
    .map((video) => ({ video, score: video.keywords.reduce((total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.video.rank - b.video.rank)
    .slice(0, limit)
    .map(({ video }) => video);
}
