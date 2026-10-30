(function () {
  const games = [];
  const families = {}; // id -> { id, name, emoji, desc }; games with `family` are listed in that family's panel
  let current = null;

  const $ = (id) => document.getElementById(id);

  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("mg:" + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("mg:" + key, JSON.stringify(value)); } catch (e) {}
    },
  };

  function register(game) { games.push(game); }

  function family(def) { families[def.id] = def; }

  const familyHash = (id) => "family/" + id;

  let guidePage = 0;

  function guideOpen() { return !$("guide").classList.contains("hidden"); }

  function openGuide() {
    if (!current || !current.guide) return;
    if (current.pause) current.pause();
    guidePage = 0;
    renderGuide();
    $("guide").classList.remove("hidden");
  }

  function closeGuide() { $("guide").classList.add("hidden"); }

  function renderGuide() {
    const pages = current.guide;
    const p = pages[guidePage];
    $("guide-icon").textContent = p.icon;
    $("guide-title").textContent = p.title;
    $("guide-text").innerHTML = p.text;
    $("guide-dots").innerHTML = pages.map((_, i) => `<span class="${i === guidePage ? "on" : ""}"></span>`).join("");
    $("guide-prev").disabled = guidePage === 0;
    $("guide-next").textContent = guidePage === pages.length - 1 ? "Tamam" : "›";
  }

  function stepGuide(d) {
    const next = guidePage + d;
    if (next >= current.guide.length) return closeGuide();
    if (next < 0) return;
    guidePage = next;
    renderGuide();
  }

  function card(item, best, hash) {
    const el = document.createElement("button");
    el.className = "card";
    el.innerHTML =
      `<div class="thumb">${item.emoji}</div>` +
      `<h3>${item.name}</h3><p>${item.desc}</p>` +
      `<span class="best">${best ? "En iyi: " + best : "Henüz oynanmadı"}</span>`;
    el.addEventListener("click", () => { location.hash = hash; });
    return el;
  }

  const bestOf = (g) => storage.get(g.id + ":best", 0);

  function renderList() {
    const list = $("game-list");
    list.innerHTML = "";
    const shown = new Set();
    games.forEach((g) => {
      if (!g.family) return list.appendChild(card(g, bestOf(g), g.id));
      if (shown.has(g.family)) return;
      shown.add(g.family);
      const f = families[g.family];
      const members = games.filter((m) => m.family === f.id);
      list.appendChild(card(f, Math.max(...members.map(bestOf)), familyHash(f.id)));
    });
    const soon = document.createElement("div");
    soon.className = "card locked";
    soon.innerHTML = `<div class="thumb">🍂</div><h3>Yakında</h3><p>Yeni mini oyunlar yolda.</p>`;
    list.appendChild(soon);
  }

  // Where the back button leads: a game in a family goes back to its panel, everything else home.
  let parent = "";
  const goBack = () => { location.hash = parent; };

  // A family's own panel: one card per version.
  function renderFamily(f) {
    const grid = document.createElement("div");
    grid.className = "game-grid family-grid";
    games.filter((g) => g.family === f.id).forEach((g) => grid.appendChild(card(g, bestOf(g), g.id)));
    $("game-root").appendChild(grid);
  }

  function route() {
    const id = location.hash.slice(1);
    const game = games.find((g) => g.id === id);
    const fam = id.startsWith("family/") ? families[id.slice(7)] : null;
    if (current) { current.unmount(); current = null; }
    closeGuide();
    $("game-root").innerHTML = "";

    if (game || fam) {
      $("home").classList.add("hidden");
      $("game").classList.remove("hidden");
      $("game-title").textContent = (game || fam).name;
      $("guide-btn").classList.toggle("hidden", !(game && game.guide));
    }
    if (game) {
      current = game;
      parent = game.family ? familyHash(game.family) : "";
      game.mount($("game-root"), { storage, openGuide, guideOpen, exit: goBack });
    } else if (fam) {
      parent = "";
      renderFamily(fam);
    } else {
      $("game").classList.add("hidden");
      $("home").classList.remove("hidden");
      renderList();
    }
  }

  function start() {
    $("back-btn").addEventListener("click", goBack);
    $("guide-btn").addEventListener("click", openGuide);
    $("guide-close").addEventListener("click", closeGuide);
    $("guide-prev").addEventListener("click", () => stepGuide(-1));
    $("guide-next").addEventListener("click", () => stepGuide(1));
    $("guide").addEventListener("click", (e) => { if (e.target.id === "guide") closeGuide(); });
    window.addEventListener("keydown", (e) => {
      if (!guideOpen()) return;
      if (e.key === "Escape") closeGuide();
      else if (e.key === "ArrowRight") stepGuide(1);
      else if (e.key === "ArrowLeft") stepGuide(-1);
      else return;
      e.preventDefault();
    });
    window.addEventListener("hashchange", route);
    route();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  window.MG = { register, family, start, storage };
})();
