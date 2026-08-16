/* クラウド同期（Supabase）。
   ログインしていると、先生が作った内容（アニメ・単語・文法・ビンゴのグループなど）が
   自動でクラウドに保存され、別の端末でログインすると自動で最新になります。

   仕組み:
     ・各ツールのコードは変更せず、localStorage.setItem を横取りして変更を検知する
     ・キーごとに「最後に変えた時刻」を持ち、クラウドと比べて新しい方を採用する（last-write-wins）
     ・手動の「クラウドから復元」も用意（JSync.restore()）

   読み込み順:  vendor/supabase.js → auth-config.js → auth.js → sync.js
   ⚠️ OpenAIのAPIキー（jclass.tts.v1 の key）は同期しません（端末内に留めます）。 */
(function () {
  var META = "jclass.sync.meta";      // { キー: 最後に変えた時刻(ISO) }
  var LAST = "jclass.sync.last";      // 最後に同期した時刻
  var TABLE = "user_data";

  // 同期しないもの：その場かぎりの状態・端末ごとの設定
  var SKIP = { "bingo.state.v1": 1, "bingo.lists.v1": 1, "jclass.voice.v1": 1 };
  function syncable(k) {
    if (!k || SKIP[k] || k === META || k === LAST) return false;
    if (/^intro\./.test(k)) return true;                       // 各ツールの説明カード
    if (/\.(data|cfg|conj|list|card)\.v\d+$/.test(k)) return true;
    return k === "bingo.groups.v2" || k === "hub.order.v1" || k === "jclass.ambient.v1" || k === "jclass.tts.v1";
  }

  var rawSet = localStorage.setItem.bind(localStorage);
  var rawGet = localStorage.getItem.bind(localStorage);
  function loadJSON(k, d) { try { var v = JSON.parse(rawGet(k)); return v == null ? d : v; } catch (e) { return d; } }
  function saveMeta() { try { rawSet(META, JSON.stringify(meta)); } catch (e) {} }

  var meta = loadJSON(META, {});
  var user = null, client = null, dirty = {}, timer = null, state = "off", lastErr = "";
  var subs = [];
  function setState(s, err) { state = s; lastErr = err || ""; subs.forEach(function (f) { try { f(s, lastErr); } catch (e) {} }); paint(); }

  // 保存するときの中身（APIキーなど秘密は取り除く）
  function valueOf(k) {
    var raw = rawGet(k); if (raw == null) return null;
    var v; try { v = JSON.parse(raw); } catch (e) { v = raw; }
    if (k === "jclass.tts.v1" && v && typeof v === "object") { v = Object.assign({}, v); delete v.key; }
    return v;
  }
  // クラウドの値を localStorage に戻す（横取りを通さず素で書く）
  function applyValue(k, v) {
    var s = (typeof v === "string") ? v : JSON.stringify(v);
    if (k === "jclass.tts.v1") {          // APIキーは今の端末のものを残す
      try {
        var cur = JSON.parse(rawGet(k) || "{}"), inc = JSON.parse(s);
        if (cur && cur.key) inc.key = cur.key;
        s = JSON.stringify(inc);
      } catch (e) {}
    }
    rawSet(k, s);
  }

  /* ---------- 変更の検知（各ツールを改造せずに済ませる） ---------- */
  localStorage.setItem = function (k, v) {
    rawSet(k, v);
    if (syncable(k)) { meta[k] = new Date().toISOString(); saveMeta(); dirty[k] = 1; schedule(); }
  };
  localStorage.removeItem = (function (orig) {
    return function (k) { orig.call(localStorage, k); if (syncable(k)) { meta[k] = new Date().toISOString(); saveMeta(); } };
  })(localStorage.removeItem.bind(localStorage));

  function schedule() {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(function () { push(); }, 1500);   // まとめて送る
  }

  /* ---------- クラウドへ送る ---------- */
  function push() {
    if (!user || !client) return Promise.resolve();
    var keys = Object.keys(dirty).filter(function (k) { return rawGet(k) != null; });
    if (!keys.length) return Promise.resolve();
    setState("syncing");
    var rows = keys.map(function (k) { return { user_id: user.id, key: k, value: valueOf(k) }; });
    return client.from(TABLE).upsert(rows, { onConflict: "user_id,key" }).select("key,updated_at")
      .then(function (r) {
        if (r.error) throw r.error;
        (r.data || []).forEach(function (row) { meta[row.key] = row.updated_at; delete dirty[row.key]; });
        saveMeta(); rawSet(LAST, new Date().toISOString());
        setState("ok");
      })
      .catch(function (e) { setState("error", (e && e.message) || String(e)); });
  }

  /* ---------- クラウドから取り込む ---------- */
  // force=true なら中身に関わらずクラウドを採用（手動の「復元」用）
  function pull(force) {
    if (!user || !client) return Promise.resolve(0);
    setState("syncing");
    return client.from(TABLE).select("key,value,updated_at")
      .then(function (r) {
        if (r.error) throw r.error;
        var n = 0;
        (r.data || []).forEach(function (row) {
          if (!syncable(row.key)) return;
          var mine = meta[row.key];
          var cloudNewer = !mine || new Date(row.updated_at) > new Date(mine);
          if (force || cloudNewer) { applyValue(row.key, row.value); meta[row.key] = row.updated_at; n++; }
        });
        saveMeta(); rawSet(LAST, new Date().toISOString());
        setState("ok");
        return n;
      })
      .catch(function (e) { setState("error", (e && e.message) || String(e)); return 0; });
  }

  // ログイン直後：ローカルの方が新しいキーは送り、クラウドが新しいキーは取り込む
  function syncAll() {
    if (!user || !client) return Promise.resolve();
    Object.keys(meta).forEach(function (k) { if (syncable(k) && rawGet(k) != null) dirty[k] = 1; });
    // 一度もクラウドに無い（＝初回ログイン）ものも送る
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (syncable(k) && !meta[k]) { meta[k] = new Date().toISOString(); dirty[k] = 1; }
    }
    saveMeta();
    return pull(false).then(function () {
      Object.keys(dirty).forEach(function (k) { if (meta[k] && rawGet(k) == null) delete dirty[k]; });
      return push();
    });
  }

  /* ---------- 画面の表示（同期中・失敗のときだけ出る小さな表示） ---------- */
  var chip = null, hideT = null;
  function paint() {
    if (state === "off") { if (chip) chip.hidden = true; return; }
    if (!chip) {
      var css = document.createElement("style");
      css.textContent = ".jsy{position:fixed;left:14px;bottom:14px;z-index:300;background:rgba(20,12,45,.9);color:#fff;border:1.5px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 15px;font:700 13px/1 'Segoe UI','Yu Gothic UI',Meiryo,system-ui;box-shadow:0 8px 22px rgba(0,0,0,.35);backdrop-filter:blur(6px)}.jsy.err{border-color:rgba(255,107,107,.6);color:#ff9aa8;cursor:pointer}";
      document.head.appendChild(css);
      chip = document.createElement("div"); chip.className = "jsy";
      (document.body || document.documentElement).appendChild(chip);
    }
    clearTimeout(hideT);
    chip.hidden = false;
    chip.classList.toggle("err", state === "error");
    chip.textContent = state === "syncing" ? "☁ 同期中…" : state === "error" ? "⚠ 同期できません（押すと詳細）" : "☁ 保存しました";
    chip.onclick = state === "error" ? function () { alert("クラウド同期のエラー:\n" + lastErr); } : null;
    if (state === "ok") hideT = setTimeout(function () { if (chip) chip.hidden = true; }, 1800);
  }

  /* ---------- 起動 ---------- */
  function start() {
    if (!window.Auth || !Auth.ready) return;
    client = Auth.client;
    Auth.onChange(function (u) {
      var was = user && user.id;
      user = u || null;
      if (user && user.id !== was) { setState("syncing"); syncAll(); }
      else if (!user) { setState("off"); }
    });
    // 画面を離れるときに未送信ぶんを送る
    window.addEventListener("beforeunload", function () { if (user && Object.keys(dirty).length) { clearTimeout(timer); push(); } });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && user) { clearTimeout(timer); push(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.JSync = {
    state: function () { return state; },
    error: function () { return lastErr; },
    lastSync: function () { return rawGet(LAST); },
    syncNow: function () { clearTimeout(timer); return push().then(function () { return pull(false); }); },
    restore: function () { return pull(true); },     // クラウドの内容で上書き（手動復元）
    onChange: function (f) { subs.push(f); f(state, lastErr); },
    syncable: syncable,
    // 動作確認用：クラウドへ送られる中身／取り込み処理（APIキーが漏れないか等の確認に使う）
    _value: valueOf, _apply: applyValue, _meta: function () { return meta; }, _dirty: function () { return Object.keys(dirty); }
  };
})();
