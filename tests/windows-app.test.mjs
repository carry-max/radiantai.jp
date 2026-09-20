import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const windowsRoot = new URL("../apps/windows-overwolf/", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, windowsRoot), "utf8");
}

test("Windows app enables only the required Overwolf packages", async () => {
  const manifest = JSON.parse(await read("package.json"));
  assert.deepEqual(manifest.overwolf.packages, ["gep", "utility", "recorder"]);
  assert.equal(manifest.main, "dist/electron/electron/main.js");
  assert.equal(manifest.build.extraResources[0].to, "native/radiantai-native.exe");
});

test("Death capture keeps a 35 second buffer and stores 25 seconds before plus 5 after", async () => {
  const runtime = await read("electron/overwolf-runtime.ts");
  assert.match(runtime, /bufferSecond:\s*35/);
  assert.match(runtime, /pastDuration:\s*25_000/);
  assert.match(runtime, /timeout:\s*5_000/);
  assert.match(runtime, /captureOverlays:\s*false/);
});

test("Native worker exposes video probing and separate replay and aim extraction", async () => {
  const worker = await read("native/src/main.rs");
  assert.match(worker, /rename_all = "snake_case"/);
  assert.match(worker, /Probe \{ input: String \}/);
  assert.match(worker, /ExtractReplay \{/);
  assert.match(worker, /ExtractAim \{/);
  assert.match(worker, /Sha256/);
});

test("Windows UI explains that no in-match advice is shown", async () => {
  const app = await read("src/App.tsx");
  assert.match(app, /試合中にAIの助言や画面表示は行いません/);
  assert.match(app, /死亡前25秒＋死亡後5秒/);
  assert.match(app, /RadiantAI isn&(?:apos|#39);t endorsed by Riot Games/);
});

test("Windows clip API uses signed private storage and the shared analysis allowance", async () => {
  const uploadRoute = await readFile(new URL("../app/api/windows/clips/upload-url/route.ts", import.meta.url), "utf8");
  const analyzeRoute = await readFile(new URL("../app/api/aim/analyze/route.ts", import.meta.url), "utf8");
  assert.match(uploadRoute, /createAimClipUpload\(user\.id\)/);
  assert.match(analyzeRoute, /reserveAnalysis\(/);
  assert.match(analyzeRoute, /completeAnalysis\(/);
  assert.match(analyzeRoute, /failAnalysis\(/);
  assert.match(analyzeRoute, /removeAimClip\(user\.id, storagePath\)/);
});

test("Production build requires both Overwolf and Windows signing credentials", async () => {
  const script = await read("scripts/build-production.ps1");
  for (const variable of ["OW_CLI_EMAIL", "OW_CLI_API_KEY", "OW_BUILD_KEY", "CSC_LINK", "CSC_KEY_PASSWORD"]) {
    assert.match(script, new RegExp(variable));
  }
  assert.match(script, /Get-AuthenticodeSignature/);
  assert.match(script, /Status -ne "Valid"/);
});
