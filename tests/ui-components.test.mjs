import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("groups sustained local HUD signals into death candidates", async () => {
  const { extractDeathCandidates } = await vite.ssrLoadModule(
    "/lib/death-detection.ts",
  );
  const samples = [
    { time: 0, panelScore: 0.04, flashScore: 0 },
    { time: 1, panelScore: 0.05, flashScore: 0 },
    { time: 2, panelScore: 0.04, flashScore: 0 },
    { time: 3, panelScore: 0.65, flashScore: 0.2 },
    { time: 4, panelScore: 0.76, flashScore: 0.1 },
    { time: 5, panelScore: 0.7, flashScore: 0 },
    { time: 6, panelScore: 0.05, flashScore: 0 },
    { time: 7, panelScore: 0.04, flashScore: 0 },
    { time: 20, panelScore: 0.05, flashScore: 0 },
    { time: 21, panelScore: 0.61, flashScore: 0.1 },
    { time: 22, panelScore: 0.68, flashScore: 0 },
    { time: 23, panelScore: 0.63, flashScore: 0 },
    { time: 24, panelScore: 0.04, flashScore: 0 },
    { time: 25, panelScore: 0.05, flashScore: 0 },
  ];

  const candidates = extractDeathCandidates(samples, 30);
  assert.equal(candidates.length, 2);
  assert.ok(candidates[0].time >= 2 && candidates[0].time <= 3);
  assert.ok(candidates[1].time >= 20 && candidates[1].time <= 21);
});
