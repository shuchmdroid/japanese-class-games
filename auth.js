/* 共通の認証モジュール（Supabase）。
   読み込み順: vendor/supabase.js → auth-config.js → auth.js
   使い方: window.Auth.ready / user() / signInGoogle() / signInEmail(email) / signOut() / onChange(cb) */
(function () {
  var cfg = window.AUTH_CONFIG || {};
  var hasCfg = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var lib = window.supabase; // vendor/supabase.js が公開するグローバル
  var ready = hasCfg && lib && typeof lib.createClient === "function";
  var client = null;

  if (ready) {
    client = lib.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // OAuth/マジックリンクの戻りURLからセッションを自動処理
        flowType: "pkce"
      }
    });
  }

  function siteUrl(path) {
    // ローカル(localhost)でも本番でも、そのオリジン + パス を返す
    return location.origin + (path || "/games.html");
  }

  var Auth = {
    ready: ready,
    configured: hasCfg,
    client: client,
    // ログイン中のユーザー（未ログイン/未設定は null）
    user: function () {
      if (!client) return Promise.resolve(null);
      return client.auth.getUser().then(function (r) { return (r && r.data && r.data.user) || null; }).catch(function () { return null; });
    },
    // Googleでログイン（成功後 redirectTo に戻る。既定は games.html）
    signInGoogle: function (redirectTo) {
      if (!client) return Promise.resolve({ error: { message: "未設定" } });
      return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo || siteUrl("/games.html") } });
    },
    // メールにマジックリンクを送る（クリックで redirectTo に戻る）
    signInEmail: function (email, redirectTo) {
      if (!client) return Promise.resolve({ error: { message: "未設定" } });
      return client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo || siteUrl("/games.html"), shouldCreateUser: true } });
    },
    // どのログイン方法が使えるか（未設定のボタンを出さないために使う）
    providers: function () {
      if (!hasCfg) return Promise.resolve({});
      return fetch(cfg.SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: cfg.SUPABASE_ANON_KEY } })
        .then(function (r) { return r.json(); })
        .then(function (j) { return (j && j.external) || {}; })
        .catch(function () { return {}; });
    },
    signOut: function () {
      if (!client) return Promise.resolve();
      return client.auth.signOut();
    },
    onChange: function (cb) {
      if (!client) { cb(null); return; }
      client.auth.getUser().then(function (r) { cb((r && r.data && r.data.user) || null); });
      client.auth.onAuthStateChange(function (_evt, session) { cb(session ? session.user : null); });
    },
    siteUrl: siteUrl
  };

  window.Auth = Auth;
})();
