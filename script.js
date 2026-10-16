"use strict";

const API = "https://api.jikan.moe/v4";
const $ = (selector) => document.querySelector(selector);

const gallery = $("#gallery");
const statusBox = $("#status");
const searchInput = $("#searchInput");
const loadMore = $("#loadMore");

let searchType = "anime";
let currentQuery = "top";
let currentPage = 1;
let hasNextPage = false;
let busy = false;
let results = [];

const readStore = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

let favorites = readStore("agGalleryFavorites", []);
let myPhotos = readStore("agGalleryPhotos", []);

function saveStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast("Storage full. Remove some saved photos and try again.");
    return false;
  }
}

function toast(message) {
  const box = $("#toast");
  box.textContent = message;
  box.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.style.display = "none", 2600);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function safeImageURL(url) {
  try {
    const parsed = new URL(url, location.href);
    if (parsed.protocol === "https:" || parsed.protocol === "data:") {
      return parsed.href;
    }
  } catch {}
  return "";
}

function normalize(item, type) {
  const image = type === "characters"
    ? item.images?.jpg?.image_url
    : item.images?.jpg?.large_image_url ||
      item.images?.jpg?.image_url;

  return {
    id: `${type}-${item.mal_id}`,
    title: type === "characters"
      ? item.name || "Unknown Character"
      : item.title || "Unknown Anime",
    subtitle: type === "characters"
      ? (item.name_kanji || "Anime Character")
      : (item.year || item.type || "Anime"),
    image: safeImageURL(image),
    source: "api",
    favoriteKey: `${type}-${item.mal_id}`
  };
}

function isFavorite(item) {
  return favorites.some(f => f.id === item.id);
}

function makeCard(item) {
  const card = document.createElement("article");
  card.className = "photo-card";

  const image = safeImageURL(item.image);
  const title = escapeHTML(item.title);
  const subtitle = escapeHTML(item.subtitle || "");
  const fav = isFavorite(item);

  card.innerHTML = `
    <div class="photo-wrap">
      <img loading="lazy" src="${escapeHTML(image)}"
           alt="${title}">
    </div>
    <div class="photo-title">${title}</div>
    <div class="photo-subtitle">${subtitle}</div>
    <div class="photo-actions">
      <button class="action-btn favorite" data-action="favorite">
        ${fav ? "♥ Saved" : "♡ Save"}
      </button>
      <button class="action-btn download" data-action="download">
        ↓ Download
      </button>
    </div>`;

  card.querySelector("img").addEventListener("error", () => {
    card.querySelector("img").alt = "Image unavailable";
    card.querySelector(".photo-wrap").style.background = "#151c30";
  });

  card.querySelector('[data-action="favorite"]')
    .addEventListener("click", () => toggleFavorite(item));

  card.querySelector('[data-action="download"]')
    .addEventListener("click", () => downloadPhoto(item));

  return card;
}

function renderList(container, items, emptyMessage) {
  container.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  items.forEach(item => {
    if (item.image) container.appendChild(makeCard(item));
  });
}

function renderMain() {
  renderList(gallery, results, "No photos found. Try another search.");
  $("#resultCount").textContent = `${results.length} photos`;
}

function renderMyPhotos() {
  renderList($("#myGallery"), myPhotos, "Your photos will appear here.");
}

function renderFavorites() {
  renderList(
    $("#favoritesGallery"),
    favorites,
    "No favorites yet. Tap Save on any photo."
  );
}

function refreshFavoriteButtons() {
  renderMain();
  renderMyPhotos();
  renderFavorites();
}

async function fetchPage(reset = false) {
  if (busy) return;

  if (reset) {
    currentPage = 1;
    results = [];
    renderMain();
  }

  busy = true;
  statusBox.hidden = false;
  statusBox.textContent = "Loading photos...";
  loadMore.disabled = true;

  try {
    const endpoint = searchType === "characters"
      ? `${API}/characters`
      : `${API}/anime`;

    let url;

    if (currentQuery === "top" && searchType === "anime") {
      url = `${API}/top/anime?page=${currentPage}&limit=24`;
    } else {
      const params = new URLSearchParams({
        q: currentQuery,
        page: String(currentPage),
        limit: "24"
      });
      url = `${endpoint}?${params.toString()}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("API busy. Wait a few seconds and retry.");
      }
      throw new Error("Could not load photos. Please retry.");
    }

    const json = await response.json();
    const type = searchType;

    const items = (json.data || [])
      .map(item => normalize(item, type))
      .filter(item => item.image);

    results = reset ? items : results.concat(items);
    hasNextPage = Boolean(json.pagination?.has_next_page);

    renderMain();
    statusBox.hidden = true;
    loadMore.hidden = !hasNextPage;
  } catch (error) {
    statusBox.hidden = false;
    statusBox.textContent = error.message || "Network error. Try again.";
    loadMore.hidden = true;
  } finally {
    busy = false;
    loadMore.disabled = false;
  }
}

function toggleFavorite(item) {
  if (isFavorite(item)) {
    favorites = favorites.filter(f => f.id !== item.id);
    toast("Removed from favorites");
  } else {
    favorites = [item, ...favorites];
    toast("Added to favorites ♥");
  }

  if (saveStore("agGalleryFavorites", favorites)) {
    refreshFavoriteButtons();
  }
}

async function downloadPhoto(item) {
  const url = safeImageURL(item.image);
  if (!url) {
    toast("Image URL is unavailable");
    return;
  }

  if (url.startsWith("data:")) {
    const link = document.createElement("a");
    link.href = url;
    link.download = "AG-ANIME-PHOTO.jpg";
    link.click();
    return;
  }

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("Download unavailable");

    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectURL;
    link.download = `${item.title.replace(/[^\w -]/g, "") || "anime"}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectURL), 1500);
    toast("Download started");
  } catch {
    // Some image hosts do not allow cross-origin downloads.
    window.open(url, "_blank", "noopener,noreferrer");
    toast("Image opened. Use your browser's Save image option.");
  }
}

function performSearch(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    toast("Enter an anime or character name");
    return;
  }

  currentQuery = cleanQuery;
  $("#sectionTitle").textContent = `Results: ${cleanQuery}`;
  fetchPage(true);
  $("#gallery").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#searchForm").addEventListener("submit", event => {
  event.preventDefault();
  performSearch(searchInput.value);
});

document.querySelectorAll(".type-btn").forEach(button => {
  button.addEventListener("click", () => {
    searchType = button.dataset.type;

    document.querySelectorAll(".type-btn").forEach(btn =>
      btn.classList.toggle("active", btn === button)
    );

    $("#sectionTitle").textContent =
      searchType === "anime" ? "Trending Anime" : "Anime Characters";

    currentQuery = searchInput.value.trim() || "top";
    fetchPage(true);
  });
});

document.querySelectorAll(".chip").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(chip =>
      chip.classList.toggle("active", chip === button)
    );

    const query = button.dataset.query;
    searchInput.value = query === "top" ? "" : query;

    if (query === "top" && searchType === "characters") {
      searchInput.value = "";
      toast("Enter a character name to search");
      return;
    }

    currentQuery = query;
    $("#sectionTitle").textContent =
      query === "top" ? "Trending Anime" : query;

    fetchPage(true);
  });
});

loadMore.addEventListener("click", () => {
  if (!busy && hasNextPage) {
    currentPage += 1;
    fetchPage(false);
  }
});

$("#photoInput").addEventListener("change", async event => {
  const files = Array.from(event.target.files || []);
  event.target.value = "";

  if (!files.length) return;

  const supported = files.filter(file =>
    file.type.startsWith("image/") && file.size <= 1024 * 1024
  );

  if (supported.length !== files.length) {
    toast("Some files skipped: choose images up to 1 MB each.");
  }

  for (const file of supported) {
    try {
      const dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
      });

      const photo = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        subtitle: "My Photo",
        image: dataURL,
        source: "local"
      };

      myPhotos = [photo, ...myPhotos];

      if (!saveStore("agGalleryPhotos", myPhotos)) {
        myPhotos.shift();
        break;
      }
    } catch {
      toast("Could not read one of your images");
    }
  }

  renderMyPhotos();
  toast("Photo import finished");
});

function scrollToSection(id) {
  document.getElementById(id).scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

$("#favoritesNav").addEventListener("click", () =>
  scrollToSection("favoritesSection")
);

$("#favoritesBottom").addEventListener("click", () =>
  scrollToSection("favoritesSection")
);

$("#myPhotosNav").addEventListener("click", () =>
  scrollToSection("myGallery")
);

$("#year").textContent = new Date().getFullYear();

renderMyPhotos();
renderFavorites();
fetchPage(true);
