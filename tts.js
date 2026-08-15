/* クラウド音声（OpenAI gpt-4o-mini-tts）で自然＆かわいいナレーションを作る共通モジュール。
   考え方: セリフを作ったときに「一度だけ」音声を生成してこの端末に保存し、
           授業では保存した音声を再生する。→ どのブラウザ/iPhoneでも同じ自然さ・一瞬で再生・無料枠で足りる。
   音声が無いセリフは voice.js（ブラウザ内蔵の声）に自動で戻る。

   キャラごとに「声・話し方・声の高さ」を設定できる（左=L / 右=R）。
     ・話し方（instructions）は"生成"に効く → 変えたら作り直しが必要
     ・声の高さ（pitch）は"再生"に効く → 作り直し不要、スライダーで即変わる

   使い方:  <script src="tts.js"></script>
     JTTS.ready()                 … APIキーが入っているか
     JTTS.play(text, side)        … 保存音声があれば再生（Promise<HTMLAudioElement|null>）side:"L"|"R"
     JTTS.has(text, side)         … 保存済みか（Promise<bool>）
     JTTS.generate(text, side)    … 生成して保存（Promise<{ok,error}>）
     JTTS.openSettings()          … 設定パネル
   ※ APIキーはこの端末のブラウザにだけ保存され、音声を作るとき OpenAI にのみ送られます。 */
(function () {
  var LS = "jclass.tts.v1";
  var PRESETS = [
    { id: "cute",   name: "かわいい子ども", text: "かわいい子どものように、明るく高めの声で、元気にはずんだ話し方をしてください。やさしく、はっきりと。" },
    { id: "boy",    name: "元気な男の子",   text: "元気な男の子のように、明るくはきはきと話してください。やさしく、はっきりと。" },
    { id: "sis",    name: "やさしいお姉さん", text: "やさしいお姉さんのように、あたたかく、ゆっくりはっきり話してください。" },
    { id: "calm",   name: "おっとり",       text: "おっとりと、やわらかく、ゆっくり話してください。" },
    { id: "anime",  name: "アニメの主人公", text: "子ども向けアニメの主人公のように、感情ゆたかに、生き生きと話してください。" },
    { id: "plain",  name: "ふつう",         text: "やさしく、はっきりと、自然に話してください。棒読みにしない。" }
  ];
  function presetText(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i].text; return PRESETS[PRESETS.length - 1].text; }

  var cfg = {
    key: "", model: "gpt-4o-mini-tts",
    voiceL: "coral", styleL: "cute",  customL: "", pitchL: 1.12,
    voiceR: "ash",   styleR: "boy",   customR: "", pitchR: 1.06
  };
  try {
    var s = JSON.parse(localStorage.getItem(LS) || "{}");
    if (s && typeof s === "object") {
      ["key", "model", "voiceL", "voiceR", "styleL", "styleR", "customL", "customR"].forEach(function (k) { if (typeof s[k] === "string") cfg[k] = s[k]; });
      ["pitchL", "pitchR"].forEach(function (k) { if (+s[k]) cfg[k] = Math.max(0.8, Math.min(1.4, +s[k])); });
      if (typeof s.instructions === "string" && s.instructions && !s.styleL) { cfg.styleL = cfg.styleR = "custom"; cfg.customL = cfg.customR = s.instructions; }  // 旧設定からの移行
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} }

  var VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
  function side(sd) { return sd === "R" ? "R" : "L"; }
  function voiceOf(sd) { return cfg["voice" + side(sd)] || "coral"; }
  function styleOf(sd) { var st = cfg["style" + side(sd)]; return st === "custom" ? (cfg["custom" + side(sd)] || "") : presetText(st); }
  function pitchOf(sd) { return cfg["pitch" + side(sd)] || 1; }

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
  function idbCount() { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction(STORE, "readonly").objectStore(STORE).count(); t.onsuccess = function () { res(t.result || 0); }; t.onerror = function () { res(0); }; }); }).catch(function () { return 0; }); }

  // 同じ文＋同じ声＋同じ話し方なら使い回す（どれかを変えると自動で別キー＝作り直しが必要とわかる）
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36); }
  function keyOf(text, sd) { var t = String(text || ""); return (cfg.model || "m") + "|" + voiceOf(sd) + "|" + hash(styleOf(sd)) + "|" + hash(t) + "|" + t.length; }

  function ready() { return !!cfg.key; }
  function has(text, sd) { return idbGet(keyOf(text, sd)).then(function (b) { return !!b; }); }

  /* ---------- 生成 ---------- */
  function generate(text, sd) {
    var t = String(text || "").trim();
    if (!t) return Promise.resolve({ ok: false, error: "テキストが空です" });
    if (!cfg.key) return Promise.resolve({ ok: false, error: "APIキーが未設定です" });
    var k = keyOf(t, sd);
    return idbGet(k).then(function (exist) {
      if (exist) return { ok: true, cached: true };
      return fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Authorization": "Bearer " + cfg.key, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, voice: voiceOf(sd), input: t, instructions: styleOf(sd), response_format: "mp3" })
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (tx) { throw new Error("APIエラー " + r.status + "：" + tx.slice(0, 200)); });
        return r.blob();
      }).then(function (blob) { return idbPut(k, blob).then(function () { return { ok: true }; }); });
    }).catch(function (e) { return { ok: false, error: (e && e.message) || String(e) }; });
  }

  /* ---------- 再生（声の高さをここで変える＝作り直し不要） ---------- */
  var curAudio = null, curURL = null;
  function stop() { try { if (curAudio) { curAudio.pause(); curAudio.currentTime = 0; } } catch (e) {} if (curURL) { URL.revokeObjectURL(curURL); curURL = null; } curAudio = null; }
  function applyPitch(a, p) {
    try {
      // preservesPitch=false にすると、再生スピードに合わせて声の高さも上がる（＝かわいい声になる）
      a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
      a.playbackRate = Math.max(0.8, Math.min(1.4, p || 1));
    } catch (e) {}
  }
  function play(text, sd) {
    return idbGet(keyOf(text, sd)).then(function (blob) {
      if (!blob) return null;
      stop();
      curURL = URL.createObjectURL(blob);
      var a = new Audio(curURL);
      applyPitch(a, pitchOf(sd));
      curAudio = a;
      var p = a.play(); if (p && p.catch) p.catch(function () {});
      return a;
    }).catch(function () { return null; });
  }

  /* ---------- 設定パネル ---------- */
  var CSS = '\
.jt-ov{position:fixed;inset:0;background:rgba(10,6,30,.66);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;z-index:420}\
.jt-p{background:#1c1346;border:1.5px solid rgba(255,255,255,.16);border-radius:18px;max-width:640px;width:100%;padding:20px;box-shadow:0 30px 70px rgba(0,0,0,.55);color:#fff;font-family:"Segoe UI","Yu Gothic UI",Meiryo,system-ui,sans-serif}\
.jt-p h3{margin:0 0 4px;font-size:19px}\
.jt-note{font-size:12.5px;color:#a99fd6;line-height:1.8;margin:0 0 12px}\
.jt-lbl{display:block;font-size:13px;font-weight:800;color:#c9c2e8;margin:12px 0 6px}\
.jt-p input[type=password],.jt-p input[type=text],.jt-p select,.jt-p textarea{width:100%;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.96);color:#241552;border-radius:10px;padding:10px;font:inherit;font-weight:700}\
.jt-p textarea{min-height:54px;font-weight:600;line-height:1.6;resize:vertical}\
.jt-chars{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px}\
@media(max-width:560px){.jt-chars{grid-template-columns:1fr}}\
.jt-card{background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.14);border-radius:14px;padding:12px}\
.jt-card h4{margin:0 0 2px;font-size:15px}\
.jt-row{display:flex;align-items:center;gap:8px}\
.jt-row input[type=range]{flex:1}\
.jt-val{font-weight:800;font-size:12.5px;color:#ffd34e;min-width:34px;text-align:right}\
.jt-acts{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}\
.jt-b{border:0;border-radius:10px;padding:11px 18px;font-weight:800;font-size:15px;cursor:pointer}\
.jt-b.test{background:rgba(255,255,255,.14);color:#fff}\
.jt-b.ok{background:linear-gradient(135deg,#ec6f9e,#2563eb);color:#fff}\
.jt-b.warn{background:rgba(255,107,107,.2);color:#ff9aa8}\
.jt-b.sm{padding:8px 12px;font-size:13px;background:rgba(255,255,255,.14);color:#fff}\
.jt-tip{margin-top:12px;padding:11px 13px;border-radius:12px;background:rgba(255,211,78,.1);border:1.5px solid rgba(255,211,78,.3);font-size:12.5px;line-height:1.8;color:#ffe9a8}\
.jt-msg{margin-top:10px;font-size:13px;font-weight:700;min-height:1.2em}\
.jt-msg.ok{color:#7af0c4}.jt-msg.err{color:#ff9aa8}';
  var styled = false;
  function ensureCSS() { if (styled) return; var el = document.createElement("style"); el.textContent = CSS; document.head.appendChild(el); styled = true; }
  function vopts(sel) { return VOICES.map(function (v) { return '<option value="' + v + '"' + (v === sel ? " selected" : "") + ">" + v + "</option>"; }).join(""); }
  function sopts(sel) { return PRESETS.map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? " selected" : "") + ">" + p.name + "</option>"; }).join("") + '<option value="custom"' + (sel === "custom" ? " selected" : "") + ">じぶんで書く</option>"; }

  function charCard(sd, title) {
    var v = voiceOf(sd), st = cfg["style" + sd], cu = cfg["custom" + sd] || "", pi = pitchOf(sd);
    return '<div class="jt-card" data-sd="' + sd + '"><h4>' + title + '</h4>\
<label class="jt-lbl">声</label><select class="jt-v">' + vopts(v) + '</select>\
<label class="jt-lbl">話し方</label><select class="jt-s">' + sopts(st) + '</select>\
<textarea class="jt-c" placeholder="話し方をじぶんで書く"' + (st === "custom" ? "" : " hidden") + '>' + cu.replace(/</g, "&lt;") + '</textarea>\
<label class="jt-lbl">声の高さ（かわいさ）</label><div class="jt-row"><input class="jt-pi" type="range" min="0.9" max="1.35" step="0.01" value="' + pi + '"><span class="jt-val">' + pi.toFixed(2) + '</span></div>\
<div style="margin-top:8px"><button class="jt-b sm jt-try">▶ この声をためす</button></div></div>';
  }

  function openSettings() {
    ensureCSS();
    var ov = document.createElement("div"); ov.className = "jt-ov";
    ov.innerHTML = '<div class="jt-p">\
<h3>🎙 AIナレーション（自然＆かわいい声）</h3>\
<p class="jt-note">セリフを作ったときに<b>一度だけ</b>音声を生成してこの端末に保存し、授業では保存した音声を再生します。<br><b>話し方</b>は音声を作るときに反映（変えたら作り直し）、<b>声の高さ</b>は再生のたびに反映（作り直し不要）です。</p>\
<label class="jt-lbl">OpenAI APIキー</label><input class="jt-key" type="password" placeholder="sk-..." value="' + (cfg.key ? cfg.key.replace(/"/g, "&quot;") : "") + '">\
<div class="jt-chars">' + charCard("L", "左のキャラ") + charCard("R", "右のキャラ") + '</div>\
<div class="jt-tip">🔑 キーは<b>この端末のブラウザにだけ</b>保存され、音声を作るとき OpenAI にのみ送られます。<br>※ 販売用に配るときは、キーを隠すサーバー経由に切り替えます。</div>\
<div class="jt-msg"></div>\
<div class="jt-acts"><button class="jt-b warn del">🗑 保存音声を消す</button><button class="jt-b ok">OK</button></div></div>';
    document.body.appendChild(ov);
    var msg = ov.querySelector(".jt-msg");
    function apply() {
      cfg.key = ov.querySelector(".jt-key").value.trim();
      ov.querySelectorAll(".jt-card").forEach(function (c) {
        var sd = c.dataset.sd;
        cfg["voice" + sd] = c.querySelector(".jt-v").value;
        cfg["style" + sd] = c.querySelector(".jt-s").value;
        cfg["custom" + sd] = c.querySelector(".jt-c").value;
        cfg["pitch" + sd] = +c.querySelector(".jt-pi").value;
        c.querySelector(".jt-val").textContent = (+c.querySelector(".jt-pi").value).toFixed(2);
        c.querySelector(".jt-c").hidden = (c.querySelector(".jt-s").value !== "custom");
      });
      save();
    }
    idbCount().then(function (n) { msg.className = "jt-msg"; msg.textContent = "保存済みの音声：" + n + "個"; });
    ov.addEventListener("input", apply);
    ov.addEventListener("change", apply);
    ov.querySelectorAll(".jt-try").forEach(function (b) {
      b.onclick = function () {
        apply();
        var sd = b.closest(".jt-card").dataset.sd;
        if (!cfg.key) { msg.className = "jt-msg err"; msg.textContent = "APIキーを入れてください。"; return; }
        msg.className = "jt-msg"; msg.textContent = "作成中…";
        var t = "こんにちは！ いっしょに あそびましょう。";
        generate(t, sd).then(function (r) {
          if (!r.ok) { msg.className = "jt-msg err"; msg.textContent = "エラー：" + r.error; return; }
          msg.className = "jt-msg ok"; msg.textContent = "✅ 再生します（" + voiceOf(sd) + " / 高さ " + pitchOf(sd).toFixed(2) + "）";
          play(t, sd);
        });
      };
    });
    ov.querySelector(".del").onclick = function () {
      if (!confirm("この端末に保存した音声を全部消しますか？（また作り直せます）")) return;
      db().then(function (d) { d.transaction(STORE, "readwrite").objectStore(STORE).clear(); setTimeout(function () { idbCount().then(function (n) { msg.className = "jt-msg ok"; msg.textContent = "消しました（保存済み：" + n + "個）"; }); }, 150); });
    };
    ov.querySelector(".ok").onclick = function () { apply(); stop(); ov.remove(); };
    ov.onclick = function (e) { if (e.target === ov) { apply(); stop(); ov.remove(); } };
  }

  window.JTTS = {
    ready: ready, has: has, generate: generate, play: play, stop: stop,
    openSettings: openSettings, config: function () { return cfg; }, voices: VOICES, presets: PRESETS, count: idbCount, keyOf: keyOf
  };
})();
