(function () {
  const BASE = {
    gain: 16,          // heat gained per second at speed 1 (track lengths / s) with a full stroke
    gainExp: 1.4,      // faster movement heats up disproportionately more
    ampExp: 1.6,       // short strokes heat up much less than full top-to-bottom strokes
    resist: 2.2,       // the higher the orange, the harder it is to raise
    decay: 15,         // heat lost per second
    zone: 70,          // orange level at which white starts filling
    limit: 95,         // orange level that ends the round (or triggers Tut in Expanded)
    fillBase: 5,       // white % per second at the zone line
    fillBonus: 1.5,    // extra multiplier near the limit
    dangerAt: 88,
    grace: 2.5,        // seconds below the zone before white starts draining
    drain: 6,          // white % lost per second while draining
    hyst: 0.04,        // min. backward movement to count as a direction change
    keySpeed: 1.8,     // track lengths / s while holding a key
    parTime: 45,       // seconds; finishing faster gives a time bonus
    tierSlow: 0.35,    // each darker white tier fills slower...
    tierValue: 0.6,    // ...but every % is worth more points
  };

  // Middle bar tints (Expanded). Darker = orange rises slower = more points.
  const TINTS = [
    { id: "deep", name: "Koyu mavi", gain: 0.65, mult: 1.5, unlock: 0 },
    { id: "blue", name: "Mavi", gain: 0.82, mult: 1.2, unlock: 1500 },
    { id: "clear", name: "Saydam", gain: 1, mult: 1, unlock: 3000 },
  ];

  const TIERS = ["#ffffff", "#f7ecdd", "#ecd6b8", "#ddbd93", "#c9a06f"];

  const TUT = {
    time: 4,          // seconds to fill the Tut bar
    tap: 9,           // % per tap on the first Tut
    tapDecay: 0.18,   // every following Tut gives less per tap
    drain: 25,        // % lost per second
    dropTo: 45,       // orange level after a successful Tut
    bonus: 250,       // points × (tier + 1)
  };

  function createWeita(opts) {
    const CFG = Object.assign({}, BASE, opts.cfg);
    const X = !!opts.expanded;
    const KEY = opts.id;
    let ctx, root, els, raf, state, onKey, onKeyUp, onVis;
    const onResize = () => render();

    function template() {
      return `
        <div class="weita">
          <div class="weita-hud">
            <span class="pill">Puan: <b data-el="score">0</b></span>
            <span class="pill">Süre: <b data-el="time">0.0</b>s</span>
            ${X ? `<span class="pill">Beyaz kat: <b data-el="tier">1</b></span>` : ""}
            <span class="pill">En iyi: <b data-el="best">0</b></span>
          </div>
          <div class="weita-stage">
            <div class="col">
              <span class="col-label">Beyaz</span>
              <div class="meter white" data-el="whiteMeter"><div class="fill" data-el="white"></div></div>
            </div>
            <div class="col">
              <span class="col-label">Salla</span>
              <div class="track" data-el="track"><div class="knob" data-el="knob"></div></div>
            </div>
            <div class="col">
              <span class="col-label">Turuncu</span>
              <div class="meter orange" data-el="orangeMeter">
                <div class="fill" data-el="orange"></div>
                <div class="zone" style="bottom:${CFG.zone}%"></div>
                <div class="limit" style="bottom:${CFG.limit}%"></div>
              </div>
            </div>
          </div>
          <p class="weita-hint">${X
            ? "Turuncu kırmızı sınıra değerse Tut! ekranı açılır."
            : "Turuncuyu kesik çizginin üstünde tut ama kırmızı sınıra değdirme!"}</p>
          <div class="weita-toast" data-el="toast"></div>
          <div class="overlay" data-el="overlay"></div>
        </div>`;
    }

    function best() { return ctx.storage.get(KEY + ":best", 0); }

    function currentTint() {
      const id = ctx.storage.get(KEY + ":tint", TINTS[0].id);
      return TINTS.find((t) => t.id === id && best() >= t.unlock) || TINTS[0];
    }

    function applyTint() {
      if (!X) return;
      const cur = currentTint().id;
      TINTS.forEach((t) => els.track.classList.toggle("tint-" + t.id, t.id === cur));
    }

    function tintPicker() {
      if (!X) return "";
      const cur = currentTint().id;
      const b = best();
      return `<div class="tints">${TINTS.map((t) => {
        const locked = b < t.unlock;
        return `<button class="tint-chip${t.id === cur ? " on" : ""}" data-act="tint" data-tint="${t.id}"${locked ? " disabled" : ""}>
          <span class="sw tint-${t.id}"></span>${t.name}<small>${locked ? "🔒 " + t.unlock : "x" + t.mult}</small></button>`;
      }).join("")}</div>`;
    }

    function showOverlay(html) {
      els.overlay.innerHTML = `<div class="panel">${html}</div>`;
      els.overlay.classList.remove("hidden");
    }

    function showIntro() {
      showOverlay(`
        <h3>${opts.name}</h3>
        <p>${opts.intro}</p>
        ${tintPicker()}
        <div class="actions">
          <button class="btn" data-act="play">Başla</button>
          <button class="btn ghost" data-act="guide">Nasıl oynanır?</button>
        </div>`);
    }

    function showPause() {
      showOverlay(`
        <h3>Mola ☕</h3>
        <p>Hazır olduğunda devam et.</p>
        <div class="actions">
          <button class="btn" data-act="resume">Devam</button>
          <button class="btn ghost" data-act="exit">Menü</button>
        </div>`);
    }

    function showEnd(title, score, isBest, note) {
      showOverlay(`
        <h3>${title}</h3>
        <div class="score">${score}</div>
        <div class="sub">${isBest ? "Yeni rekor!" : "En iyi: " + best()}</div>
        ${note ? `<p class="unlock">${note}</p>` : ""}
        ${tintPicker()}
        <div class="actions">
          <button class="btn" data-act="play">Tekrar</button>
          <button class="btn ghost" data-act="exit">Menü</button>
        </div>`);
    }

    function showTut() {
      showOverlay(`
        <h3>Tut! 🔥</h3>
        <p>Butona durmadan bas, barı doldur!</p>
        <div class="tut-bar"><div class="tut-fill" data-el="tutFill"></div></div>
        <div class="tut-time" data-el="tutTime"></div>
        <button class="tut-btn" data-act="tap">TUT</button>`);
      els.tutFill = els.overlay.querySelector('[data-el="tutFill"]');
      els.tutTime = els.overlay.querySelector('[data-el="tutTime"]');
      renderTut();
    }

    function toast(text) {
      els.toast.textContent = text;
      els.toast.classList.remove("show");
      void els.toast.offsetWidth;
      els.toast.classList.add("show");
    }

    function resetStroke() {
      state.stroke = { dir: 0, start: state.pos, ext: state.pos, last: 0 };
      state.lastPos = state.pos;
      state.speed = 0;
    }

    function reset() {
      const tint = X ? currentTint() : null;
      state = {
        playing: false,
        paused: false,
        mode: "play",
        pos: 0.5, lastPos: 0.5,
        speed: 0,
        heat: 0, white: 0,
        points: 0,
        tier: 0, tuts: 0, tut: null,
        gainMul: tint ? tint.gain : 1,
        mult: tint ? tint.mult : 1,
        below: 0,
        time: 0, last: 0,
        drag: null,
        keyDir: 0,
      };
      resetStroke();
      applyTint();
      render();
    }

    function play() {
      reset();
      state.playing = true;
      els.overlay.classList.add("hidden");
      state.last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }

    function pause() {
      if (!state.playing || state.paused) return;
      state.paused = true;
      state.drag = null;
      state.keyDir = 0;
      cancelAnimationFrame(raf);
      showPause();
    }

    function resume() {
      if (!state.paused) return;
      state.paused = false;
      if (state.mode === "tut") showTut();
      else els.overlay.classList.add("hidden");
      state.last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function finish(won) {
      state.playing = false;
      cancelAnimationFrame(raf);
      let score = Math.floor(state.points);
      if (won) score += Math.max(0, Math.round((CFG.parTime - state.time) * 20 * state.mult));
      const prevBest = best();
      const isBest = score > prevBest;
      if (isBest) ctx.storage.set(KEY + ":best", score);

      let note = "";
      if (X) {
        const fresh = TINTS.filter((t) => prevBest < t.unlock && score >= t.unlock).pop();
        if (fresh) {
          ctx.storage.set(KEY + ":tint", fresh.id);
          applyTint();
          note = `${fresh.name} açıldı! Orta bar hafifledi.`;
        }
      }

      render(score);
      const title = won ? "Harika denge! ✨" : state.mode === "tut" ? "Tutamadın! 🔥" : "Taştı! 🔥";
      showEnd(title, score, isBest, note);
    }

    function startTut() {
      state.mode = "tut";
      state.drag = null;
      state.keyDir = 0;
      state.tut = { progress: 0, time: TUT.time, tap: TUT.tap / (1 + TUT.tapDecay * state.tuts) };
      showTut();
    }

    function tap() {
      if (state.mode !== "tut" || state.paused || !state.playing) return;
      state.tut.progress += state.tut.tap;
      if (state.tut.progress >= 100) return tutWin();
      renderTut();
    }

    function tutWin() {
      const bonus = Math.round(TUT.bonus * (state.tier + 1) * state.mult);
      state.points += bonus;
      state.tuts++;
      state.tier = Math.min(TIERS.length - 1, state.tier + 1);
      state.heat = TUT.dropTo;
      state.below = 0;
      state.mode = "play";
      resetStroke();
      els.overlay.classList.add("hidden");
      toast(`+${bonus} · Beyaz koyulaştı`);
      render();
    }

    function renderTut() {
      els.tutFill.style.width = Math.min(100, state.tut.progress) + "%";
      els.tutTime.textContent = Math.max(0, state.tut.time).toFixed(1) + "s";
    }

    // Returns the size (0..1) of the current back-and-forth stroke.
    function strokeAmplitude() {
      const s = state.stroke;
      const p = state.pos;
      if (s.dir === 0) {
        if (Math.abs(p - s.start) > CFG.hyst) { s.dir = Math.sign(p - s.start); s.ext = p; }
      } else if ((p - s.ext) * s.dir > 0) {
        s.ext = p;
      } else if ((s.ext - p) * s.dir > CFG.hyst) {
        s.last = Math.abs(s.ext - s.start);
        s.start = s.ext;
        s.dir = -s.dir;
        s.ext = p;
      }
      return Math.max(Math.abs(s.ext - s.start), s.last);
    }

    function loop(now) {
      if (!state.playing || state.paused) return;
      const dt = Math.min(0.05, (now - state.last) / 1000);
      state.last = now;

      if (state.mode === "tut") {
        const t = state.tut;
        t.time -= dt;
        t.progress = Math.max(0, t.progress - TUT.drain * dt);
        if (t.time <= 0) return finish(false);
        renderTut();
        raf = requestAnimationFrame(loop);
        return;
      }

      state.time += dt;

      if (state.keyDir) state.pos = clamp(state.pos + state.keyDir * CFG.keySpeed * dt);

      const raw = dt > 0 ? Math.abs(state.pos - state.lastPos) / dt : 0;
      state.lastPos = state.pos;
      state.speed += (raw - state.speed) * Math.min(1, dt * 12);

      const amp = strokeAmplitude();
      const h = state.heat / 100;
      const resist = 1 / (1 + CFG.resist * h * h);
      const gain = CFG.gain * state.gainMul * Math.pow(state.speed, CFG.gainExp) * Math.pow(amp, CFG.ampExp) * resist;
      state.heat = Math.max(0, state.heat + (gain - CFG.decay) * dt);

      if (state.heat >= CFG.limit) {
        state.heat = CFG.limit;
        render();
        if (X) { startTut(); raf = requestAnimationFrame(loop); return; }
        return finish(false);
      }

      const before = state.white;
      if (state.heat >= CFG.zone) {
        state.below = 0;
        const t = (state.heat - CFG.zone) / (CFG.limit - CFG.zone);
        const slow = 1 / (1 + CFG.tierSlow * state.tier);
        state.white = Math.min(100, state.white + CFG.fillBase * (1 + CFG.fillBonus * t) * slow * dt);
      } else {
        state.below += dt;
        if (state.below > CFG.grace) state.white = Math.max(0, state.white - CFG.drain * dt);
      }
      const rate = 10 * (1 + CFG.tierValue * state.tier) * state.mult;
      state.points = Math.max(0, state.points + (state.white - before) * rate);
      if (state.white >= 100) return finish(true);

      render();
      raf = requestAnimationFrame(loop);
    }

    function render(finalScore) {
      const trackH = els.track.clientHeight;
      const knobH = els.knob.offsetHeight || 0;
      const y = knobH / 2 + state.pos * Math.max(0, trackH - knobH);
      els.knob.style.top = y + "px";
      els.orange.style.height = state.heat + "%";
      els.white.style.height = state.white + "%";
      els.white.style.background = state.tier ? TIERS[state.tier] : "";
      els.orangeMeter.classList.toggle("danger", state.heat >= CFG.dangerAt);
      els.whiteMeter.classList.toggle("filling", state.heat >= CFG.zone);
      els.whiteMeter.classList.toggle("draining", state.below > CFG.grace && state.white > 0);
      els.score.textContent = finalScore !== undefined ? finalScore : Math.floor(state.points);
      els.time.textContent = state.time.toFixed(1);
      els.best.textContent = best();
      if (els.tier) els.tier.textContent = state.tier + 1;
    }

    function clamp(v) { return Math.min(1, Math.max(0, v)); }

    function range() {
      return Math.max(1, els.track.clientHeight - els.knob.offsetHeight);
    }

    function onDown(e) {
      if (!state.playing || state.paused || state.mode !== "play") return;
      els.track.setPointerCapture(e.pointerId);
      state.drag = { id: e.pointerId, y: e.clientY, pos: state.pos };
      e.preventDefault();
    }

    function onMove(e) {
      if (!state.drag || state.drag.id !== e.pointerId) return;
      state.pos = clamp(state.drag.pos + (e.clientY - state.drag.y) / range());
      e.preventDefault();
    }

    function onUp(e) {
      if (state.drag && state.drag.id === e.pointerId) state.drag = null;
    }

    function mount(container, context) {
      ctx = context;
      root = container;
      root.innerHTML = template();
      els = {};
      root.querySelectorAll("[data-el]").forEach((n) => { els[n.dataset.el] = n; });

      els.overlay.addEventListener("pointerdown", (e) => {
        const btn = e.target.closest('[data-act="tap"]');
        if (btn) { e.preventDefault(); tap(); }
      });
      els.overlay.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "play") play();
        if (act === "resume") resume();
        if (act === "guide") ctx.openGuide();
        if (act === "exit") ctx.exit();
        if (act === "tint") {
          ctx.storage.set(KEY + ":tint", btn.dataset.tint);
          applyTint();
          els.overlay.querySelectorAll(".tint-chip").forEach((c) => c.classList.toggle("on", c === btn));
        }
      });
      els.track.addEventListener("pointerdown", onDown);
      els.track.addEventListener("pointermove", onMove);
      els.track.addEventListener("pointerup", onUp);
      els.track.addEventListener("pointercancel", onUp);

      onKey = (e) => {
        if (ctx.guideOpen()) return;
        const k = e.key.toLowerCase();
        const confirm = k === " " || k === "enter";
        if (confirm && state.mode === "tut" && state.playing && !state.paused) { if (!e.repeat) tap(); }
        else if (k === "arrowup" || k === "w") state.keyDir = -1;
        else if (k === "arrowdown" || k === "s") state.keyDir = 1;
        else if (confirm && state.paused) resume();
        else if (confirm && !state.playing) play();
        else if (k === "escape" || k === "p") pause();
        else return;
        e.preventDefault();
      };
      onKeyUp = (e) => {
        const k = e.key.toLowerCase();
        if ((k === "arrowup" || k === "w") && state.keyDir === -1) state.keyDir = 0;
        if ((k === "arrowdown" || k === "s") && state.keyDir === 1) state.keyDir = 0;
      };
      onVis = () => { if (document.hidden) pause(); };
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("resize", onResize);
      document.addEventListener("visibilitychange", onVis);

      reset();
      requestAnimationFrame(() => render());
      showIntro();
    }

    function unmount() {
      cancelAnimationFrame(raf);
      if (state) state.playing = false;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    }

    return { id: opts.id, name: opts.name, emoji: opts.emoji, desc: opts.desc, guide: opts.guide, mount, unmount, pause };
  }

  const GUIDE = {
    goal: { icon: "🎯", title: "Amaç", text: "Soldaki <b>beyaz</b> barı tamamen doldur. Bunun için sağdaki <b>turuncu</b> barı belli bir seviyede tutman gerekiyor." },
    move: { icon: "↕️", title: "Salla", text: "Ortadaki daireyi parmağınla ya da farenle yukarı aşağı sürükle. PC'de <b>↑ ↓</b> veya <b>W S</b> tuşları da olur." },
    stroke: { icon: "📏", title: "Uzun hareketler", text: "Ufak titremeler turuncuyu pek yükseltmez. Daireyi <b>tepeden dibe</b> kadar götürüp getirdikçe ve hızlandıkça turuncu çok daha hızlı dolar." },
    resist: { icon: "🧱", title: "Giderek zorlaşır", text: "Turuncu yükseldikçe yükseltmesi zorlaşır. Durursan ya da yavaşlarsan turuncu kendiliğinden azalır." },
    zone: { icon: "〰️", title: "Kesik çizgi", text: "Turuncu, kesik çizgiyi geçtiğinde beyaz dolmaya başlar. Sınıra ne kadar yakınsan beyaz o kadar hızlı dolar." },
    limit: { icon: "🔥", title: "Kırmızı sınır", text: "Turuncu en üstteki <b>kırmızı sınıra</b> değerse tur biter. Bar titremeye başladıysa biraz yavaşla!" },
    melt: { icon: "🍂", title: "Beyaz erir", text: "Turuncu uzun süre kesik çizginin altında kalırsa beyaz bar yavaş yavaş <b>azalmaya</b> başlar." },
    score: { icon: "🏆", title: "Puan", text: "Puan, beyazın doluluğuna göre hesaplanır. Beyazı tamamen doldurursan <b>1000</b> puan alırsın, ne kadar hızlı bitirirsen o kadar bonus kazanırsın." },
    tint: { icon: "🔵", title: "Orta barın rengi", text: "Orta bar <b>koyu mavi</b> başlar ve turuncuyu yükseltmek zordur. Rekorun <b>1500</b>'ü geçince <b>Mavi</b>, <b>3000</b>'i geçince <b>Saydam</b> açılır. Daha koyu rengi istediğin zaman geri seçebilirsin: zorlaşır ama puan çarpanı artar." },
    tut: { icon: "✊", title: "Tut!", text: "Turuncu kırmızı sınıra değerse <b>Tut!</b> ekranı açılır. Süre bitmeden butona durmadan basıp barı doldur. PC'de <b>Boşluk</b> tuşu da olur. Başarırsan turuncu düşer ve bonus puan kazanırsın. Başaramazsan tur biter." },
    tier: { icon: "🎨", title: "Beyaz koyulaşır", text: "Her başarılı Tut'ta beyaz bar bir <b>kat</b> koyulaşır. Koyu beyaz daha yavaş dolar ama her yüzdesi daha çok puan verir. Sonraki Tut'lar da daha zordur." },
    xscore: { icon: "🏆", title: "Puan", text: "Puan; beyazın dolduğu yüzdeye, beyazın katına ve orta barın rengine göre birikir. Beyazı tamamen doldurduğunda tur biter, hızlı bitirirsen süre bonusu da alırsın." },
  };

  MG.register(createWeita({
    id: "weita",
    name: "Weita Basic",
    emoji: "🟠",
    desc: "Turuncuyu dengede tut, beyazı doldur.",
    intro: "Daireyi baştan sona uzun uzun salla, turuncuyu çizginin üstünde tut, beyazı doldur.",
    guide: ["goal", "move", "stroke", "resist", "zone", "limit", "melt", "score"].map((k) => GUIDE[k]),
  }));

  MG.register(createWeita({
    id: "weita-expanded",
    name: "Weita Expanded",
    emoji: "🔵",
    desc: "Renkli orta bar, Tut! anları ve koyulaşan beyaz.",
    intro: "Turuncu tepeye ulaşınca pes etme: Tut! ekranında butona durmadan bas, beyazı koyulaştır, puanı katla.",
    expanded: true,
    guide: ["goal", "move", "stroke", "resist", "zone", "tint", "tut", "tier", "melt", "xscore"].map((k) => GUIDE[k]),
  }));
})();
