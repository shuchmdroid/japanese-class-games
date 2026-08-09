// 単語カードメーカー — ローカル静的サーバー（依存ゼロ・Node標準のみ）
//
// このアプリはオフライン・APIなしで動きます。
// データ（カード・画像・設定）は data.json にこのサーバー経由で保存されます。
// 開発／利用は http://localhost:5183
//
// 使い方:
//   node server.mjs   → http://localhost:5183 を開く
//   （start.bat をダブルクリックでも起動します）

import http from "node:http";
import { exec } from "node:child_process";
import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5183;
const DATA_FILE = join(__dir, "data.json");   // データ本体はこのファイルに保存される

function readBody(req, limitMB = 128) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > limitMB * 1024 * 1024) { reject(Object.assign(new Error("データが大きすぎます"), { status: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// GET  /api/data → data.json の中身（無ければ空）
// POST /api/data → data.json を上書き保存（tmp→rename で安全に）
async function handleData(req, res) {
  if (req.method === "GET") {
    let txt = "{}";
    try { txt = await readFile(DATA_FILE, "utf8"); } catch (_) { /* 初回はファイルが無い → 空データ */ }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(txt);
  }
  if (req.method === "POST") {
    const body = await readBody(req);
    let parsed;
    try { parsed = JSON.parse(body || "{}"); } catch (e) { res.writeHead(400, { "content-type": "application/json; charset=utf-8" }); return res.end('{"error":"invalid JSON"}'); }
    const tmp = DATA_FILE + ".tmp";
    await writeFile(tmp, JSON.stringify(parsed), "utf8");
    await rename(tmp, DATA_FILE);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return res.end('{"ok":true}');
  }
  res.writeHead(405, { "content-type": "application/json; charset=utf-8" });
  res.end('{"error":"method not allowed"}');
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

async function serveStatic(req, res, path) {
  let rel = decodeURIComponent(path);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = normalize(join(__dir, rel));
  if (!filePath.startsWith(__dir)) { res.writeHead(403); return res.end("forbidden"); } // パストラバーサル防止
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) throw new Error("dir");
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch (_) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 not found: " + rel);
  }
}

const server = http.createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  try {
    if (path === "/api/data") return await handleData(req, res);
    return await serveStatic(req, res, path);
  } catch (err) {
    res.writeHead(err.status || 500, { "content-type": "text/plain; charset=utf-8" });
    res.end(err.message || "server error");
  }
});

server.listen(PORT, () => {
  console.log(`\n  単語カードメーカー  →  http://localhost:${PORT}`);
  console.log(`  データ保存先: ${DATA_FILE}\n`);
  if (process.env.WC_OPEN === "1") {   // start.bat から起動したときだけ既定ブラウザを自動で開く
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === "win32" ? `start "" "${url}"`
              : process.platform === "darwin" ? `open "${url}"`
              : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
