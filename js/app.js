(function () {
  const games = [];
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

  function renderList() {
    const list = $("game-list");
    list.innerHTML = "";
    games.forEach((g) => {
      const card = document.createElement("button");
      card.className = "card";
      const best = storage.get(g.id + ":best", 0);
      card.innerHTML =
        `<div class="thumb">${g.emoji}</div>` +
        `<h3>${g.name}</h3><p>${g.desc}</p>` +
        `<span class="best">${best ? "En iyi: " + best : "Henüz oynanmadı"}</span>`;
      card.addEventListener("click", () => { location.hash = g.id; });
      list.appendChild(card);
    });
    const soon = document.createElement("div");
    soon.className = "card locked";
    soon.innerHTML = `<div class="thumb">🍂</div><h3>Yakında</h3><p>Yeni mini oyunlar yolda.</p>`;
    list.appendChild(soon);
  }

  function route() {
    const id = location.hash.slice(1);
    const game = games.find((g) => g.id === id);
    if (current) { current.unmount(); current = null; }
    closeGuide();
    $("game-root").innerHTML = "";

    if (game) {
      $("home").classList.add("hidden");
      $("game").classList.remove("hidden");
      $("game-title").textContent = game.name;
      current = game;
      $("guide-btn").classList.toggle("hidden", !game.guide);
      game.mount($("game-root"), { storage, openGuide, guideOpen, exit: () => { location.hash = ""; } });
    } else {
      $("game").classList.add("hidden");
      $("home").classList.remove("hidden");
      renderList();
    }
  }

  function start() {
    $("back-btn").addEventListener("click", () => { location.hash = ""; });
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

  window.MG = { register, start, storage };
})();
