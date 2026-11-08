const radar = globalThis.PitchLabRadar;
const byId = (id) => document.getElementById(id);
const asset = (path) => `../${path}`;
const sport = byId("sport");
const league = byId("league");
const context = byId("context");

function setOptions(select, entries) {
  select.replaceChildren(...entries.map(({ label, id }) => new Option(label, id)));
}

function updatePreview() {
  const variant = radar.resolve({ sport: sport.value, league: league.value, context: context.value });
  const isBase = variant.sport.id === "general";
  byId("stage").style.setProperty("--edition", variant.accent);
  byId("stage-type").textContent = isBase ? "Edición base" : variant.sport.label;
  const image = byId("mascot");
  image.src = asset(variant.image);
  image.alt = isBase ? "Radar con su tableta de análisis" : `Radar con el uniforme de ${variant.label}`;
  byId("edition-name").textContent = isBase ? "Radar" : variant.label;
  byId("edition-detail").textContent = variant.league?.kit ??
    (isBase ? "Traje de observador y tableta táctica" : "Uniforme del deporte");
  const badge = byId("badge-icon");
  badge.src = asset(variant.badge);
  badge.classList.toggle("glyph", !variant.badgeIsEmblem);
  byId("context-icon").src = asset(variant.icon);
  byId("context-name").textContent = variant.context.label;
  byId("context-copy").textContent = variant.context.copy;
  byId("download").href = asset(variant.image);
  byId("edition-grid").querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.value === league.value));
  });
}

function populateLeagues() {
  const editions = radar.leagues.filter(({ sport: id }) => id === sport.value);
  setOptions(league, [{ id: "", label: "Edición general" }, ...editions]);
  league.disabled = editions.length === 0;
}

function editionTile(competition) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.value = competition.id;
  button.style.setProperty("--edition", competition.accent);
  const image = document.createElement("img");
  image.loading = "lazy";
  image.width = image.height = 124;
  image.alt = "";
  image.src = asset(radar.resolve({ league: competition.id }).image);
  button.append(image, competition.label);
  button.addEventListener("click", () => {
    sport.value = competition.sport;
    populateLeagues();
    league.value = competition.id;
    updatePreview();
    league.focus();
  });
  item.append(button);
  return item;
}

function iconTile([id, label]) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = asset(radar.iconPath(id));
  link.download = `${id}.svg`;
  link.setAttribute("aria-label", `Descargar icono SVG de ${label}`);
  const image = document.createElement("img");
  image.className = "glyph";
  image.width = image.height = 24;
  image.alt = "";
  image.src = link.href;
  link.append(image, label);
  item.append(link);
  return item;
}

setOptions(sport, radar.sports);
setOptions(context, radar.contexts);
sport.addEventListener("change", () => {
  populateLeagues();
  updatePreview();
});
league.addEventListener("change", updatePreview);
context.addEventListener("change", updatePreview);
byId("icon-grid").replaceChildren(...radar.icons.map(iconTile));
byId("edition-grid").replaceChildren(...radar.leagues.map(editionTile));
populateLeagues();
updatePreview();
