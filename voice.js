/* 日本語ナレーション（共通）。
   端末にある日本語音声のうち「自然な声」を自動で選び、教師が選び直せるようにする。
   使い方:  <script src="voice.js"></script>
            JVoice.speak("こんにちは")   … しゃべる
            JVoice.stop()                … 止める
            JVoice.openPicker()          … 声の設定を開く
   設定は localStorage("jclass.voice.v1") に保存され、全ツールで共通。 */
(function () {
  var LS = "jclass.voice.v1";
  var cfg = { name: "", rate: 0.95, pitch: 1 };
  try { var s = JSON.parse(localStorage.getItem(LS) || "{}"); if (s && typeof s === "object") { if (typeof s.name === "string") cfg.name = s.name; if (+s.rate) cfg.rate = Math.max(0.5, Math.min(1.5, +s.rate)); if (+s.pitch) cfg.pitch = Math.max(0.5, Math.min(1.5, +s.pitch)); } } catch (e) {}
  function save() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} }

  var voices = [];
  function refresh() { try { voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []) .filter(function (v) { return /^ja/i.test(v.lang || ""); }); } catch (e) { voices = []; } }
  refresh();
  if (window.speechSynthesis) { try { speechSynthesis.onvoiceschanged = refresh; } catch (e) {} setTimeout(refresh, 500); setTimeout(refresh, 1500); }

  // 自然な声ほど高い点数（Edgeのニューラル音声・Appleの拡張音声・Googleの音声を優先）
  function score(v) {
    var n = v.name || "", s = 0;
    if (/natural|neural|online/i.test(n)) s += 100;   // Microsoft ○○ Online (Natural) など
    if (/premium|enhanced/i.test(n)) s += 80;         // iPhone/Mac の高品質音声
    if (/siri/i.test(n)) s += 70;
    if (/google/i.test(n)) s += 60;
    if (!v.localService) s += 20;                     // サーバー製の声は概ね自然
    return s;
  }
  function isNatural(v) { return score(v) >= 60; }
  function ranked() { return voices.slice().sort(function (a, b) { return score(b) - score(a); }); }
  function pick() {
    if (cfg.name) { for (var i = 0; i < voices.length; i++) if (voices[i].name === cfg.name) return voices[i]; }
    return ranked()[0] || null;
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    var t = String(text == null ? "" : text);
    if (!t.trim()) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(t);
      var v = pick();
      if (v) u.voice = v;
      u.lang = (v && v.lang) || "ja-JP";
      u.rate = cfg.rate; u.pitch = cfg.pitch;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function stop() { try { speechSynthesis.cancel(); } catch (e) {} }

  /* ---------- 声の設定パネル ---------- */
  var CSS = '\
.jv-ov{position:fixed;inset:0;background:rgba(10,6,30,.66);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;z-index:400}\
.jv-p{background:#1c1346;border:1.5px solid rgba(255,255,255,.16);border-radius:18px;max-width:520px;width:100%;padding:20px;box-shadow:0 30px 70px rgba(0,0,0,.55);color:#fff;font-family:"Segoe UI","Yu Gothic UI",Meiryo,system-ui,sans-serif}\
.jv-p h3{margin:0 0 4px;font-size:19px}\
.jv-note{font-size:12.5px;color:#a99fd6;line-height:1.75;margin:0 0 14px}\
.jv-lbl{display:block;font-size:13px;font-weight:800;color:#c9c2e8;margin:12px 0 6px}\
.jv-p select{width:100%;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.96);color:#241552;border-radius:10px;padding:10px;font:inherit;font-weight:700}\
.jv-row{display:flex;align-items:center;gap:10px}\
.jv-row input[type=range]{flex:1}\
.jv-val{font-weight:800;font-size:13px;color:#ffd34e;min-width:38px;text-align:right}\
.jv-acts{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}\
.jv-b{border:0;border-radius:10px;padding:11px 18px;font-weight:800;font-size:15px;cursor:pointer}\
.jv-b.test{background:rgba(255,255,255,.14);color:#fff}\
.jv-b.ok{background:linear-gradient(135deg,#ec6f9e,#2563eb);color:#fff}\
.jv-tip{margin-top:14px;padding:11px 13px;border-radius:12px;background:rgba(122,240,196,.12);border:1.5px solid rgba(122,240,196,.35);font-size:12.5px;line-height:1.8;color:#bff3df}\
.jv-none{color:#ff9aa8;font-weight:700;font-size:13px}';
  var styled = false;
  function ensureCSS() { if (styled) return; var el = document.createElement("style"); el.textContent = CSS; document.head.appendChild(el); styled = true; }

  function openPicker() {
    ensureCSS(); refresh();
    var cur = pick();
    var ov = document.createElement("div");
    ov.className = "jv-ov";
    var opts = ranked().map(function (v) {
      return '<option value="' + v.name.replace(/"/g, "&quot;") + '"' + (cur && v.name === cur.name ? " selected" : "") + '>' + (isNatural(v) ? "★ " : "") + v.name + (isNatural(v) ? "（自然）" : "") + "</option>";
    }).join("");
    ov.innerHTML = '<div class="jv-p">\
<h3>🔊 ナレーションの声</h3>\
<p class="jv-note">この端末で使える日本語の声から選べます。<b>★（自然）</b>が付いた声がいちばん自然に聞こえます。</p>' +
      (voices.length ? '<label class="jv-lbl">声</label><select class="jv-sel">' + opts + '</select>' : '<p class="jv-none">この端末には日本語の音声が見つかりませんでした。</p>') +
      '<label class="jv-lbl">はやさ</label><div class="jv-row"><input class="jv-rate" type="range" min="0.6" max="1.3" step="0.05" value="' + cfg.rate + '"><span class="jv-val jv-rv">' + cfg.rate.toFixed(2) + '</span></div>\
<label class="jv-lbl">高さ</label><div class="jv-row"><input class="jv-pitch" type="range" min="0.7" max="1.3" step="0.05" value="' + cfg.pitch + '"><span class="jv-val jv-pv">' + cfg.pitch.toFixed(2) + '</span></div>\
<div class="jv-tip">💡 もっと自然な声にするには…<br>・<b>Windows</b>：このページを <b>Microsoft Edge</b> で開くと「Nanami / Keita（Natural）」が使えます<br>・<b>iPhone/iPad</b>：設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 日本語 で「<b>拡張／プレミアム</b>」をダウンロード</div>\
<div class="jv-acts"><button class="jv-b test">▶ ためす</button><button class="jv-b ok">OK</button></div></div>';
    document.body.appendChild(ov);
    var sel = ov.querySelector(".jv-sel"), rate = ov.querySelector(".jv-rate"), pitch = ov.querySelector(".jv-pitch");
    function apply() {
      if (sel) cfg.name = sel.value;
      cfg.rate = +rate.value; cfg.pitch = +pitch.value;
      ov.querySelector(".jv-rv").textContent = cfg.rate.toFixed(2);
      ov.querySelector(".jv-pv").textContent = cfg.pitch.toFixed(2);
      save();
    }
    if (sel) sel.onchange = function () { apply(); speak("こんにちは。今日はいい天気ですね。"); };
    rate.oninput = apply; pitch.oninput = apply;
    ov.querySelector(".test").onclick = function () { apply(); speak("こんにちは。今日はいい天気ですね。"); };
    ov.querySelector(".ok").onclick = function () { apply(); stop(); ov.remove(); };
    ov.onclick = function (e) { if (e.target === ov) { apply(); stop(); ov.remove(); } };
  }

  window.JVoice = { speak: speak, stop: stop, openPicker: openPicker, voices: function () { return ranked(); }, config: function () { return cfg; } };
})();
