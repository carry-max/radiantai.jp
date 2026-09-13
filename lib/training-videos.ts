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
    videoId: "Smozh3gEFV4",
    rank: 1,
    mode: "aim",
    title: "Lazが思う正しいエイム練習法など実践で使えることをお答えします",
    creator: "Lazvell",
    url: "https://www.youtube.com/watch?v=Smozh3gEFV4",
    level: "全ランク",
    summary: "日本トップレベルで戦ったLazの考え方から、実戦につながるAIM練習と上達の基準を学べます。",
    skills: ["AIM練習", "実戦への応用", "練習基準"],
    keywords: ["練習", "ルーティン", "精度", "フリック", "追いAIM", "弱点"],
  },
  {
    videoId: "C5zvMC0eGbU",
    rank: 2,
    mode: "aim",
    title: "プロがやっている究極のクロスヘアの置き方",
    creator: "GON",
    url: "https://www.youtube.com/watch?v=C5zvMC0eGbU",
    level: "全ランク",
    summary: "敵が出る前の照準位置を整え、反応後の大きな修正を減らすクロスヘアの置き方を学べます。",
    skills: ["クロスヘアプレイスメント", "照準の高さ", "プリエイム"],
    keywords: ["クロスヘア", "照準", "初期位置", "高さ", "プリエイム", "大きな修正"],
  },
  {
    videoId: "6cBCjvTOTyU",
    rank: 3,
    mode: "aim",
    title: "レディ日本1位が教えるプロでは常識のエイム・撃ち合いの強化法",
    creator: "たっと",
    url: "https://www.youtube.com/watch?v=6cBCjvTOTyU",
    level: "初級〜中級",
    summary: "AIM単体だけでなく、停止や撃ち方を含めて撃ち合いを強くする実戦的なメカニクスを学べます。",
    skills: ["ストッピング", "撃ち方", "撃ち合い"],
    keywords: ["ストッピング", "移動", "撃ち方", "バースト", "静止", "ブレ", "ピーク"],
  },
  {
    videoId: "M5elbcHrHsY",
    rank: 4,
    mode: "aim",
    title: "yatsukaから超有料級の「AIMの考え方」について教わるcrow",
    creator: "crowfps / yatsuka",
    url: "https://www.youtube.com/watch?v=M5elbcHrHsY",
    level: "中級〜上級",
    summary: "日本の競技シーンで戦う選手同士の対話から、照準修正と撃ち合いで意識する点を深く学べます。",
    skills: ["AIMの思考", "照準修正", "振り返り"],
    keywords: ["小さな修正", "マイクロ", "フリック", "反応", "感度", "照準修正", "考え方"],
  },
  {
    videoId: "GTj5GTAkpj0",
    rank: 1,
    mode: "tactics",
    title: "初心者〜中級者向け「基本の強いピークの仕方」解説講座",
    creator: "gosiofps解説",
    url: "https://www.youtube.com/watch?v=GTj5GTAkpj0",
    level: "初級〜中級",
    summary: "よくある失敗、操作、プリエイムまで含め、勝ちやすいピークの基本を順序立てて学べます。",
    skills: ["ピークの仕方", "プリエイム", "接敵準備"],
    keywords: ["ピーク", "射線", "角度", "生存", "遮蔽", "クリアリング", "プリエイム", "デス"],
  },
  {
    videoId: "3pgIpXnsz28",
    rank: 2,
    mode: "tactics",
    title: "常に有利を作れるMeiy流ドライピーク方法",
    creator: "Meiy",
    url: "https://www.youtube.com/watch?v=3pgIpXnsz28",
    level: "中級〜上級",
    summary: "日本トッププロの実戦例から、スキルなしでも有利を作るピークと間合いを確認できます。",
    skills: ["ドライピーク", "ピークアドバンテージ", "間合い"],
    keywords: ["ピークアドバンテージ", "ピーク", "角度", "ドライ", "間合い", "相手視点", "オフアングル"],
  },
  {
    videoId: "_3IAzQk083c",
    rank: 3,
    mode: "tactics",
    title: "撃ち合いの勝率が爆上がりする「立ち回り」を元日本1位が徹底解説",
    creator: "たっと",
    url: "https://www.youtube.com/watch?v=_3IAzQk083c",
    level: "全ランク",
    summary: "撃つ前の位置取りと判断を整え、同じAIMでも撃ち合いの勝率を上げる立ち回りを学べます。",
    skills: ["位置取り", "撃ち合いの条件", "判断"],
    keywords: ["判断", "情報", "立ち回り", "タイミング", "味方", "人数", "位置取り", "トレード"],
  },
  {
    videoId: "Nlo2NQPoztQ",
    rank: 4,
    mode: "tactics",
    title: "セットアップ後に大切な守り方のプランについて",
    creator: "Lazvell",
    url: "https://www.youtube.com/watch?v=Nlo2NQPoztQ",
    level: "中級〜上級",
    summary: "守りでセットアップした後のプラン、情報に応じた判断、無駄なデスを減らす考え方を学べます。",
    skills: ["守りのプラン", "情報判断", "生存"],
    keywords: ["守り", "セットアップ", "判断", "情報", "ローテ", "マップ", "生存", "スキル"],
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
