import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Radiant AI — VALORANT Replay Coach",
    short_name: "Radiant AI",
    description: "VALORANTの録画を試合後に振り返るAIコーチ",
    start_url: "/analysis?source=windows-app",
    scope: "/",
    display: "standalone",
    background_color: "#080b10",
    theme_color: "#080b10",
    orientation: "landscape",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
