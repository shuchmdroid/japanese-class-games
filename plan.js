/* 有料プランの判定と、無料プランの上限案内。
   無料プラン: 各ツールで「自分で作れるのは1つまで」（最初から入っているサンプルは対象外）
   有料プラン: 制限なし

   読み込み順:  vendor/supabase.js → auth-config.js → auth.js → plan.js
   使い方:
     JPlan.paid()                         … 有料か（読み込み前は false）
     JPlan.guardAdd(list, "ページ")        … 追加してよいか。だめなら案内を出して false を返す
     JPlan.mark(obj)                      … 新しく作ったものに印を付ける（数える対象になる）
     JPlan.openUpgrade()                  … 購入の案内を開く

   ※ データは各端末の中にあるため、この制限は「良心にもとづく上限」です。
      購読状態そのものは Supabase 側（書き込み不可のテーブル）で管理していて偽装できません。 */
(function () {
  var FREE_LIMIT = 1;                    // 無料で作れる数（既定）
  var LIMITS = { "フレーズ": 5, "漢字": 5 };  // 1つずつが小さい項目はもう少し許す
  var MARK = "_mine";                    // 先生が作ったものの印

  var paid = false, loaded = false, subs = [], userId = null;
  function limitFor(unit) { return LIMITS[unit] || FREE_LIMIT; }
  function mineCount(list) {
    if (!list || !list.length) return 0;
    var n = 0; for (var i = 0; i < list.length; i++) if (list[i] && list[i][MARK]) n++;
    return n;
  }

  function load() {
    if (!window.Auth || !Auth.ready) { loaded = true; return Promise.resolve(false); }
    return Auth.user().then(function (u) {
      userId = u && u.id;
      if (!u) { paid = false; loaded = true; notify(); return false; }
      return Auth.client.from("subscriptions").select("status,current_period_end").eq("user_id", u.id).maybeSingle()
        .then(function (r) {
          var s = r && r.data;
          var okStatus = s && (s.status === "active" || s.status === "trialing");
          var notExpired = !s || !s.current_period_end || new Date(s.current_period_end) > new Date();
          paid = !!(okStatus && notExpired);
          loaded = true; notify(); return paid;
        })
        .catch(function () { paid = false; loaded = true; notify(); return false; });
    });
  }
  function notify() { subs.forEach(function (f) { try { f(paid); } catch (e) {} }); }

  /* ---------- 上限に達したときの案内 ---------- */
  var styled = false;
  function ensureCSS() {
    if (styled) return; styled = true;
    var el = document.createElement("style");
    el.textContent = ".jp-ov{position:fixed;inset:0;background:rgba(10,6,30,.7);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px 16px;z-index:500}"
      + ".jp-p{background:linear-gradient(165deg,#241a52,#1a1140);border:1.5px solid rgba(255,255,255,.2);border-radius:20px;max-width:460px;width:100%;padding:26px 24px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,.6);font-family:'Segoe UI','Yu Gothic UI',Meiryo,system-ui,sans-serif;text-align:center}"
      + ".jp-p h3{margin:0 0 10px;font-size:21px}.jp-p p{margin:0 0 8px;font-size:14.5px;line-height:1.9;color:#e7e2ff}"
      + ".jp-note{font-size:12.5px;color:#a99fd6;line-height:1.8;margin-top:10px}"
      + ".jp-b{border:0;border-radius:12px;padding:14px 22px;font-weight:800;font-size:16px;cursor:pointer;margin:16px 6px 0}"
      + ".jp-b.buy{background:linear-gradient(135deg,#ffe27a,#ffb43b);color:#3a2400;box-shadow:0 10px 26px rgba(255,170,40,.4)}"
      + ".jp-b.no{background:rgba(255,255,255,.12);color:#fff}"
      + ".jp-b.login{background:linear-gradient(135deg,#ec6f9e,#2563eb);color:#fff}";
    document.head.appendChild(el);
  }
  function dialog(html, buttons) {
    ensureCSS();
    var ov = document.createElement("div"); ov.className = "jp-ov";
    ov.innerHTML = '<div class="jp-p">' + html + '<div>' + buttons + '</div></div>';
    document.body.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    ov.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { ov.remove(); }; });
    return ov;
  }
  function openUpgrade(unit) {
    var link = (window.PLAN_CONFIG && PLAN_CONFIG.CHECKOUT_URL) || "";
    var buy = link
      ? '<button class="jp-b buy" id="jpBuy">✨ 有料プランにする</button>'
      : '<button class="jp-b buy" disabled title="準備中">✨ 有料プラン（準備中）</button>';
    var ov = dialog(
      '<h3>✨ 無料プランの上限です</h3>'
      + '<p>' + (unit ? ('無料プランで作れる<b>' + unit + '</b>は' + limitFor(unit) + 'つまでです。') : '無料プランの上限に達しました。')
      + '<br>有料プランにすると<b>いくつでも</b>作れます。</p>'
      + '<p class="jp-note">今あるものの編集・削除・授業での利用は、無料のままでも続けられます。</p>',
      buy + '<button class="jp-b no" data-close>とじる</button>');
    var b = ov.querySelector("#jpBuy");
    if (b) b.onclick = function () { checkout(); };
  }
  function needLogin() {
    dialog('<h3>🔑 ログインが必要です</h3><p>作った内容をアカウントに保存し、どの端末でも使えるようにするため、ログインしてください。</p>',
      '<button class="jp-b login" id="jpLogin">ログインする</button><button class="jp-b no" data-close>あとで</button>')
      .querySelector("#jpLogin").onclick = function () { location.href = "login.html"; };
  }
  // 購入ページへ（誰の支払いかを Stripe に伝えるため、アカウントIDを添える）
  function checkout() {
    var link = (window.PLAN_CONFIG && PLAN_CONFIG.CHECKOUT_URL) || "";
    if (!link) return;
    if (!userId) { needLogin(); return; }
    var sep = link.indexOf("?") >= 0 ? "&" : "?";
    location.href = link + sep + "client_reference_id=jg_" + encodeURIComponent(userId);
  }

  /* ---------- 追加してよいか ---------- */
  function guardAdd(list, unit) {
    if (paid || !loaded) return true;               // 有料、または判定前は止めない
    if (mineCount(list) < limitFor(unit)) return true;
    if (!userId) { needLogin(); return false; }     // 未ログインなら、まずログインを案内
    openUpgrade(unit);
    return false;
  }
  // あと何個作れるか（有料は無制限）。AI一括のように複数まとめて追加するときに使う
  function allowance(list, unit) { return paid || !loaded ? Infinity : Math.max(0, limitFor(unit) - mineCount(list)); }
  function mark(o) { if (o && typeof o === "object") o[MARK] = true; return o; }

  window.JPlan = {
    paid: function () { return paid; },
    loaded: function () { return loaded; },
    guardAdd: guardAdd,
    allowance: allowance,
    mark: mark,
    mineCount: mineCount,
    limitFor: limitFor,
    openUpgrade: openUpgrade,
    checkout: checkout,
    refresh: load,
    onChange: function (f) { subs.push(f); f(paid); }
  };

  if (window.Auth && Auth.ready) { Auth.onChange(function () { load(); }); } else { loaded = true; }
})();
