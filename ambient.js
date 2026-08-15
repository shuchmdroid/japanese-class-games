/* 背景に合わせた環境音（2〜3秒）。Web Audio で合成するので音声ファイル不要・オフラインでも鳴る。
   使い方:  <script src="ambient.js"></script>
            JAmbient.play("park")     … 公園なら小鳥＋そよ風を約2.6秒
            JAmbient.stop()
            JAmbient.enabled(true/false)
   対応: park / class / home / cafe / sea / night / school / snow */
(function () {
  var LS = "jclass.ambient.v1";
  var on = true;
  try { var s = localStorage.getItem(LS); if (s === "0") on = false; } catch (e) {}
  function setEnabled(v) { on = !!v; try { localStorage.setItem(LS, on ? "1" : "0"); } catch (e) {} }

  var ctx = null, master = null, stopAt = 0;
  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function stop() {
    if (master) { try { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, .05); } catch (e) {} }
    setTimeout(function () { if (master) { try { master.disconnect(); } catch (e) {} master = null; } }, 300);
  }

  // ざらざらノイズ（風・波・ざわめきのもと）
  function noiseBuffer(c, sec) {
    var n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noise(c, out, t0, dur, opts) {
    opts = opts || {};
    var src = c.createBufferSource(); src.buffer = noiseBuffer(c, Math.max(0.3, dur)); src.loop = true;
    var f = c.createBiquadFilter(); f.type = opts.type || "bandpass";
    f.frequency.value = opts.freq || 800; f.Q.value = opts.q || 0.7;
    var g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(out);
    var pk = opts.gain || 0.05;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(pk, t0 + (opts.attack || 0.4));
    g.gain.setValueAtTime(pk, t0 + dur - (opts.release || 0.6));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.start(t0); src.stop(t0 + dur + 0.05);
    if (opts.sweep) { f.frequency.setValueAtTime(opts.freq, t0); f.frequency.linearRampToValueAtTime(opts.sweep, t0 + dur); }
    return g;
  }
  // ぴちゅん、という単発の音（小鳥・虫・食器など）
  function blip(c, out, t0, opts) {
    opts = opts || {};
    var o = c.createOscillator(); o.type = opts.type || "sine";
    var g = c.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(out);
    var f0 = opts.f0 || 2200, f1 = (opts.f1 == null ? f0 * 1.25 : opts.f1), d = opts.dur || 0.12, pk = opts.gain || 0.06;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + d);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(pk, t0 + Math.min(0.03, d * .3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.start(t0); o.stop(t0 + d + 0.02);
  }

  // 背景ごとの環境音（約2.4〜2.8秒）
  var SCENES = {
    park: function (c, out, t) {            // 小鳥のさえずり＋そよ風
      noise(c, out, t, 2.6, { type: "lowpass", freq: 700, gain: 0.035, sweep: 500 });
      [0.25, 0.42, 0.95, 1.15, 1.75, 2.05].forEach(function (d, i) {
        blip(c, out, t + d, { f0: 2100 + (i % 3) * 320, f1: 3000 + (i % 2) * 500, dur: 0.1, gain: 0.05 });
        blip(c, out, t + d + 0.1, { f0: 2800, f1: 2200, dur: 0.08, gain: 0.035 });
      });
    },
    sea: function (c, out, t) {             // 波の寄せ返し＋かもめ
      noise(c, out, t, 1.5, { type: "lowpass", freq: 500, gain: 0.075, sweep: 260, attack: .6, release: .7 });
      noise(c, out, t + 1.35, 1.3, { type: "lowpass", freq: 480, gain: 0.06, sweep: 240, attack: .5, release: .6 });
      blip(c, out, t + 0.8, { f0: 1500, f1: 900, dur: 0.3, gain: 0.04 });
      blip(c, out, t + 1.15, { f0: 1400, f1: 850, dur: 0.28, gain: 0.03 });
    },
    night: function (c, out, t) {           // 虫の音（コオロギ）＋しずかな空気
      noise(c, out, t, 2.6, { type: "lowpass", freq: 300, gain: 0.02 });
      for (var i = 0; i < 14; i++) {
        var d = 0.2 + i * 0.17;
        blip(c, out, t + d, { f0: 4200, f1: 4000, dur: 0.05, gain: 0.03 });
        blip(c, out, t + d + 0.06, { f0: 4300, f1: 4100, dur: 0.05, gain: 0.025 });
      }
    },
    cafe: function (c, out, t) {            // 店内のざわめき＋カップの音
      noise(c, out, t, 2.6, { type: "bandpass", freq: 500, q: 0.6, gain: 0.05 });
      noise(c, out, t, 2.6, { type: "lowpass", freq: 250, gain: 0.03 });
      blip(c, out, t + 0.7, { type: "triangle", f0: 2600, f1: 1800, dur: 0.18, gain: 0.05 });
      blip(c, out, t + 1.6, { type: "triangle", f0: 3100, f1: 2200, dur: 0.15, gain: 0.04 });
    },
    "class": function (c, out, t) {         // 教室のざわつき＋チャイム2音
      noise(c, out, t, 2.4, { type: "bandpass", freq: 600, q: 0.5, gain: 0.035 });
      blip(c, out, t + 0.15, { type: "sine", f0: 880, f1: 880, dur: 0.55, gain: 0.06 });
      blip(c, out, t + 0.75, { type: "sine", f0: 660, f1: 660, dur: 0.7, gain: 0.055 });
    },
    school: function (c, out, t) {          // チャイム＋外の空気
      noise(c, out, t, 2.6, { type: "lowpass", freq: 600, gain: 0.03 });
      [[0.1, 1046], [0.55, 880], [1.0, 784], [1.45, 587]].forEach(function (p) {
        blip(c, out, t + p[0], { type: "sine", f0: p[1], f1: p[1], dur: 0.6, gain: 0.055 });
      });
    },
    home: function (c, out, t) {            // しずかな部屋＋時計のカチカチ
      noise(c, out, t, 2.6, { type: "lowpass", freq: 220, gain: 0.028 });
      for (var i = 0; i < 5; i++) blip(c, out, t + 0.3 + i * 0.5, { type: "square", f0: 1500, f1: 700, dur: 0.035, gain: 0.03 });
    },
    snow: function (c, out, t) {            // しんしんとした風
      noise(c, out, t, 2.8, { type: "lowpass", freq: 420, gain: 0.055, sweep: 260, attack: .8, release: .9 });
      noise(c, out, t + 0.4, 1.6, { type: "bandpass", freq: 900, q: .5, gain: 0.02 });
    }
  };

  function play(bg) {
    if (!on) return 0;
    var fn = SCENES[bg]; if (!fn) return 0;
    var c = audio(); if (!c) return 0;
    stop();
    master = c.createGain(); master.gain.value = 1; master.connect(c.destination);
    var t = c.currentTime + 0.02;
    try { fn(c, master, t); } catch (e) { return 0; }
    return 2800;   // だいたいの長さ(ms)
  }

  window.JAmbient = {
    play: play, stop: stop,
    enabled: function (v) { if (v === undefined) return on; setEnabled(v); if (!on) stop(); return on; },
    scenes: Object.keys(SCENES)
  };
})();
