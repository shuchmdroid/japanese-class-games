/* クラウド音声（OpenAI gpt-4o-mini-tts）で自然なナレーションを作る共通モジュール。
   考え方: セリフを作ったときに「一度だけ」音声を生成してこの端末に保存し、
           授業では保存した音声を再生する。→ どのブラウザ/iPhoneでも同じ自然さ・一瞬で再生・無料枠で足りる。
   音声が無いセリフは voice.js（ブラウザ内蔵の声）に自動で戻る。

   使い方:  <script src="tts.js"></script>
     JTTS.ready()                     … APIキーが入っているか
     JTTS.play(text, voice)           … 保存音声があれば再生（Promise<HTMLAudioElement|null>）
     JTTS.has(text, voice)            … 保存済みか（Promise<bool>）
     JTTS.generate(text, voice)       … 生成して保存（Promise<{ok,error}>）
     JTTS.openSettings()              … 設定パネル
   ※ APIキーはこの端末のブラウザにだけ保存され、外部には送りません（OpenAI以外には送信しません）。 */
(function () {
  var LS = "jclass.tts.v1";
  var cfg = {
    key: "", model: "gpt-4o-mini-tts",
    voiceL: "coral", voiceR: "ash",
    instructions: "やさしく、はっきりと、子ども向けアニメのキャラクターのように自然に話してください。棒読みにしない。"
  };
  try {
    var s = JSON.parse(localStorage.getItem(LS) || "{}");
    if (s && typeof s === "object") ["key", "model", "voiceL", "voiceR", "instructions"].forEach(function (k) { if (typeof s[k] === "string") cfg[k] = s[k]; });
  } catch (e) {}
  function save() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} }

  // OpenAI の声（日本語も話せます）
  var VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];

  /* ---------- 保存先（IndexedDB：localStorage より容量が大きい） ---------- */
  var DB = "jclass-tts", STORE = "audio", dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function idbGet(k) { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction(STORE, "readonly").objectStore(STORE).get(k); t.onsuccess = function () { res(t.result || null); }; t.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function idbPut(k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction(STORE, "readwrite").objectStore(STORE).put(v, k); t.onsuccess = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }
  function idbDel(k) { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction(STORE, "readwrite").objectStore(STORE).delete(k); t.onsuccess = t.onerror = function () { res(true); }; }); }).catch(function () {}); }
  function idbCount() { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction(STORE, "readonly").objectStore(STORE).count(); t.onsuccess = function () { res(t.result || 0); }; t.onerror = function () { res(0); }; }); }).catch(function () { return 0; }); }

  // 同じ文＋同じ声なら使い回す（文を直すと自動で別のキーになる＝作り直しが必要とわかる）
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36); }
  function keyOf(text, voice) { return (cfg.model || "m") + "|" + (voice || "") + "|" + hash(String(text || "")) + "|" + String(text || "").length; }

  function ready() { return !!cfg.key; }
  function has(text, voice) { return idbGet(keyOf(text, voice)).then(function (b) { return !!b; }); }

  /* ---------- 生成 ---------- */
  function generate(text, voice) {
    var t = String(text || "").trim();
    if (!t) return Promise.resolve({ ok: false, error: "テキストが空です" });
    if (!cfg.key) return Promise.resolve({ ok: false, error: "APIキーが未設定です" });
    var k = keyOf(t, voice);
    return idbGet(k).then(function (exist) {
      if (exist) return { ok: true, cached: true };
      return fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Authorization": "Bearer " + cfg.key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, voice: voice || cfg.voiceL, input: t, instructions: cfg.instructions, response_format: "mp3" })
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (tx) { throw new Error("APIエラー " + r.status + "：" + tx.slice(0, 200)); });
        return r.blob();
      }).then(function (blob) { return idbPut(k, blob).then(function () { return { ok: true }; }); });
    }).catch(function (e) { return { ok: false, error: (e && e.message) || String(e) }; });
  }

  /* ---------- 再生 ---------- */
  var curAudio = null, curURL = null;
  function stop() { try { if (curAudio) { curAudio.pause(); curAudio.currentTime = 0; } } catch (e) {} if (curURL) { URL.revokeObjectURL(curURL); curURL = null; } curAudio = null; }
  function play(text, voice) {
    return idbGet(keyOf(text, voice)).then(function (blob) {
      if (!blob) return null;
      stop();
      curURL = URL.createObjectURL(blob);
      var a = new Audio(curURL);
      curAudio = a;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
      return a;
    }).catch(function () { return null; });
  }

  /* ---------- 設定パネル ---------- */
  var CSS = '\
.jt-ov{position:fixed;inset:0;background:rgba(10,6,30,.66);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;z-index:420}\
.jt-p{background:#1c1346;border:1.5px solid rgba(255,255,255,.16);border-radius:18px;max-width:560px;width:100%;padding:20px;box-shadow:0 30px 70px rgba(0,0,0,.55);color:#fff;font-family:"Segoe UI","Yu Gothic UI",Meiryo,system-ui,sans-serif}\
.jt-p h3{margin:0 0 4px;font-size:19px}\
.jt-note{font-size:12.5px;color:#a99fd6;line-height:1.8;margin:0 0 12px}\
.jt-lbl{display:block;font-size:13px;font-weight:800;color:#c9c2e8;margin:12px 0 6px}\
.jt-p input,.jt-p select,.jt-p textarea{width:100%;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.96);color:#241552;border-radius:10px;padding:10px;font:inherit;font-weight:700}\
.jt-p textarea{min-height:60px;font-weight:600;line-height:1.6;resize:vertical}\
.jt-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}\
.jt-acts{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}\
.jt-b{border:0;border-radius:10px;padding:11px 18px;font-weight:800;font-size:15px;cursor:pointer}\
.jt-b.test{background:rgba(255,255,255,.14);color:#fff}\
.jt-b.ok{background:linear-gradient(135deg,#ec6f9e,#2563eb);color:#fff}\
.jt-b.warn{background:rgba(255,107,107,.2);color:#ff9aa8}\
.jt-tip{margin-top:12px;padding:11px 13px;border-radius:12px;background:rgba(255,211,78,.1);border:1.5px solid rgba(255,211,78,.3);font-size:12.5px;line-height:1.8;color:#ffe9a8}\
.jt-msg{margin-top:10px;font-size:13px;font-weight:700;min-height:1.2em}\
.jt-msg.ok{color:#7af0c4}.jt-msg.err{color:#ff9aa8}';
  var styled = false;
  function ensureCSS() { if (styled) return; var el = document.createElement("style"); el.textContent = CSS; document.head.appendChild(el); styled = true; }
  function vopts(sel) { return VOICES.map(function (v) { return '<option value="' + v + '"' + (v === sel ? " selected" : "") + ">" + v + "</option>"; }).join(""); }

  function openSettings() {
    ensureCSS();
    var ov = document.createElement("div"); ov.className = "jt-ov";
    ov.innerHTML = '<div class="jt-p">\
<h3>🎙 AIナレーション（自然な音声）</h3>\
<p class="jt-note">セリフを作ったときに<b>一度だけ</b>音声を生成してこの端末に保存し、授業では保存した音声を再生します。<br>だから<b>どのブラウザ・iPhoneでも同じ自然さ</b>で、読み込みも一瞬です。</p>\
<label class="jt-lbl">OpenAI APIキー</label><input class="jt-key" type="password" placeholder="sk-..." value="' + (cfg.key ? cfg.key.replace(/"/g, "&quot;") : "") + '">\
<div class="jt-two"><div><label class="jt-lbl">左キャラの声</label><select class="jt-vl">' + vopts(cfg.voiceL) + '</select></div>\
<div><label class="jt-lbl">右キャラの声</label><select class="jt-vr">' + vopts(cfg.voiceR) + '</select></div></div>\
<label class="jt-lbl">話し方の指示</label><textarea class="jt-ins">' + (cfg.instructions || "").replace(/</g, "&lt;") + '</textarea>\
<div class="jt-tip">🔑 キーは<b>この端末のブラウザにだけ</b>保存され、音声を作るとき OpenAI にのみ送られます。<br>※ 販売用に配る場合は、キーを隠すサーバー経由に切り替えます（あとで対応できます）。</div>\
<div class="jt-msg"></div>\
<div class="jt-acts"><button class="jt-b warn del">🗑 保存音声を消す</button><button class="jt-b test">▶ ためす</button><button class="jt-b ok">OK</button></div></div>';
    document.body.appendChild(ov);
    var msg = ov.querySelector(".jt-msg");
    function apply() {
      cfg.key = ov.querySelector(".jt-key").value.trim();
      cfg.voiceL = ov.querySelector(".jt-vl").value;
      cfg.voiceR = ov.querySelector(".jt-vr").value;
      cfg.instructions = ov.querySelector(".jt-ins").value;
      save();
    }
    idbCount().then(function (n) { msg.className = "jt-msg"; msg.textContent = "保存済みの音声：" + n + "個"; });
    ov.querySelector(".test").onclick = function () {
      apply();
      if (!cfg.key) { msg.className = "jt-msg err"; msg.textContent = "APIキーを入れてください。"; return; }
      msg.className = "jt-msg"; msg.textContent = "作成中…";
      var t = "こんにちは。今日はいい天気ですね。いっしょに あそびましょう。";
      generate(t, cfg.voiceL).then(function (r) {
        if (!r.ok) { msg.className = "jt-msg err"; msg.textContent = "エラー：" + r.error; return; }
        msg.className = "jt-msg ok"; msg.textContent = "✅ 再生します（左キャラの声：" + cfg.voiceL + "）";
        play(t, cfg.voiceL);
      });
    };
    ov.querySelector(".del").onclick = function () {
      if (!confirm("この端末に保存した音声を全部消しますか？（また作り直せます）")) return;
      db().then(function (d) { d.transaction(STORE, "readwrite").objectStore(STORE).clear(); setTimeout(function () { idbCount().then(function (n) { msg.className = "jt-msg ok"; msg.textContent = "消しました（保存済み：" + n + "個）"; }); }, 150); });
    };
    ov.querySelector(".ok").onclick = function () { apply(); stop(); ov.remove(); };
    ov.onclick = function (e) { if (e.target === ov) { apply(); stop(); ov.remove(); } };
  }

  window.JTTS = {
    ready: ready, has: has, generate: generate, play: play, stop: stop,
    openSettings: openSettings, config: function () { return cfg; }, voices: VOICES, count: idbCount, keyOf: keyOf
  };
})();
