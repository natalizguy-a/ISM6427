// SkyCast — weather for Cambridge, MA (and anywhere else you search).
// Data from Open-Meteo (free, no API key). Values are fetched in metric
// and converted for display, so switching units needs no new request.

const USER_NAME = "Natali";
const HOME = { name: "Cambridge, MA", lat: 42.3736, lon: -71.1097 };
const REFRESH_MS = 10 * 60 * 1000;

const state = {
  place: loadJSON("place") || HOME,
  unit: loadJSON("unit") || "F",
  theme: loadJSON("theme") || null,
  metric: "temp",
  hours: 24,
  data: null,
  air: null,
};

// ---------- helpers ----------
function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem("skycast:" + key)); } catch { return null; }
}
function saveJSON(key, value) {
  try { localStorage.setItem("skycast:" + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
const $ = (id) => document.getElementById(id);
const temp = (c) => Math.round(state.unit === "F" ? c * 9 / 5 + 32 : c);
const tempStr = (c) => `${temp(c)}°`;
// Both scales, e.g. "41°F (5°C)".
const toF = (c) => Math.round(c * 9 / 5 + 32);
const bothStr = (c) => `${toF(c)}°F (${Math.round(c)}°C)`;
const span2 = (a, b) => (a === b ? `${a}` : a < 0 || b < 0 ? `${a} to ${b}` : `${a}–${b}`);
const bothRange = (lo, hi) => `${span2(toF(lo), toF(hi))}°F (${span2(Math.round(lo), Math.round(hi))}°C)`;
const speed = (kmh) => state.unit === "F" ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
const precip = (mm) => state.unit === "F" ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`;
const pad = (n) => String(n).padStart(2, "0");
// Open-Meteo returns local times like "2026-10-29T14:00"; parse as naive local.
const parseLocal = (s) => new Date(s);
const hourLabel = (s) => {
  const h = parseLocal(s).getHours();
  return h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
};
const clockLabel = (s) => {
  const d = parseLocal(s);
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
};

const WMO = {
  0: ["Clear sky", "☀️", "🌙"], 1: ["Mainly clear", "🌤️", "🌙"], 2: ["Partly cloudy", "⛅", "☁️"],
  3: ["Overcast", "☁️", "☁️"], 45: ["Fog", "🌫️", "🌫️"], 48: ["Freezing fog", "🌫️", "🌫️"],
  51: ["Light drizzle", "🌦️", "🌧️"], 53: ["Drizzle", "🌦️", "🌧️"], 55: ["Heavy drizzle", "🌧️", "🌧️"],
  56: ["Freezing drizzle", "🌧️", "🌧️"], 57: ["Freezing drizzle", "🌧️", "🌧️"],
  61: ["Light rain", "🌦️", "🌧️"], 63: ["Rain", "🌧️", "🌧️"], 65: ["Heavy rain", "🌧️", "🌧️"],
  66: ["Freezing rain", "🌧️", "🌧️"], 67: ["Freezing rain", "🌧️", "🌧️"],
  71: ["Light snow", "🌨️", "🌨️"], 73: ["Snow", "🌨️", "🌨️"], 75: ["Heavy snow", "❄️", "❄️"],
  77: ["Snow grains", "🌨️", "🌨️"], 80: ["Rain showers", "🌦️", "🌧️"], 81: ["Rain showers", "🌧️", "🌧️"],
  82: ["Violent showers", "⛈️", "⛈️"], 85: ["Snow showers", "🌨️", "🌨️"], 86: ["Heavy snow showers", "❄️", "❄️"],
  95: ["Thunderstorm", "⛈️", "⛈️"], 96: ["Thunderstorm & hail", "⛈️", "⛈️"], 99: ["Thunderstorm & hail", "⛈️", "⛈️"],
};
const wmo = (code, isDay = 1) => {
  const w = WMO[code] || ["Unknown", "🌡️", "🌡️"];
  return { text: w[0], icon: isDay ? w[1] : w[2] };
};
const kind = (code) =>
  [95, 96, 99].includes(code) ? "storm" :
  [71, 73, 75, 77, 85, 86].includes(code) ? "snow" :
  code >= 51 ? "rain" :
  [45, 48].includes(code) ? "fog" :
  code >= 2 ? "cloud" : "clear";

// ---------- data ----------
async function fetchWeather({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "temperature_2m,apparent_temperature,precipitation,snow_depth,soil_temperature_0cm,precipitation_probability,weather_code,is_day,wind_speed_10m,uv_index",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  return res.json();
}

async function fetchAir({ lat, lon }) {
  try {
    const params = new URLSearchParams({ latitude: lat, longitude: lon, timezone: "auto", current: "us_aqi,pm2_5,pm10,ozone" });
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
    return res.ok ? res.json() : null;
  } catch { return null; }
}

async function searchCities(q) {
  const params = new URLSearchParams({ name: q, count: 6, language: "en", format: "json" });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.results || [];
}

async function load() {
  $("now-desc").textContent = "Loading…";
  try {
    const [data, air] = await Promise.all([fetchWeather(state.place), fetchAir(state.place)]);
    state.data = data;
    state.air = air;
    render();
  } catch (err) {
    $("now-desc").textContent = "Couldn't load weather. Check your connection and try again.";
    console.error(err);
  }
}

// ---------- render ----------
function currentHourIndex(d) {
  const key = d.current.time.slice(0, 13);
  const i = d.hourly.time.findIndex((t) => t.startsWith(key));
  return i < 0 ? 0 : i;
}

function render() {
  const d = state.data;
  if (!d) return;
  const c = d.current;
  const hi = currentHourIndex(d);
  const w = wmo(c.weather_code, c.is_day);
  const uv = d.hourly.uv_index[hi] ?? 0;

  renderGreeting(c);
  $("place").textContent = state.place.name;
  $("now-icon").textContent = w.icon;
  $("now-temp").textContent = tempStr(c.temperature_2m);
  $("now-desc").textContent = w.text;
  $("now-range").textContent = `H ${tempStr(d.daily.temperature_2m_max[0])} · L ${tempStr(d.daily.temperature_2m_min[0])}`;
  $("unit-btn").textContent = `°${state.unit}`;

  $("s-feels").textContent = tempStr(c.apparent_temperature);
  $("s-hum").textContent = `${c.relative_humidity_2m}%`;
  $("s-hum-bar").style.width = `${c.relative_humidity_2m}%`;
  $("s-wind").textContent = speed(c.wind_speed_10m);
  $("s-gust").textContent = `Gusts ${speed(c.wind_gusts_10m)} · from ${compassDir(c.wind_direction_10m)}`;
  // Arrow points where the wind blows *to*; ➤ points right (east) at 0°.
  $("s-wind-arrow").style.transform = `rotate(${c.wind_direction_10m + 90}deg)`;
  $("s-uv").textContent = uv.toFixed(1);
  $("s-uv-bar").style.width = `${Math.min(uv / 11, 1) * 100}%`;
  $("s-uv-txt").textContent = uvText(uv);
  $("s-press").textContent = `${Math.round(c.pressure_msl)} hPa`;
  $("s-cloud").textContent = `Cloud cover ${c.cloud_cover}%`;

  const aqi = state.air?.current?.us_aqi;
  $("s-aqi").textContent = aqi != null ? Math.round(aqi) : "n/a";
  $("s-aqi-txt").textContent = aqi != null ? `${aqiText(aqi)} · PM2.5 ${state.air.current.pm2_5?.toFixed(1)} µg/m³` : "";

  $("fun-tip").innerHTML = `💡 ${funTip(c, d, hi)}`;

  renderAlerts(d, hi);
  renderWear(d, hi);
  renderWalk(d);
  renderEvents(d);
  renderHourly(d, hi);
  renderChart(d, hi);
  renderDaily(d);
  renderSun(d);
  renderMoon();
  renderActivities(c, d, hi, uv);
  renderSky(c);
  tickClock();
  $("updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function renderGreeting(c) {
  // Greeting follows the local time of the place being shown.
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: state.data.timezone, hour: "numeric", hourCycle: "h23" }));
  const [hello, icon] =
    hour >= 5 && hour < 12 ? ["Good morning", "☀️"] :
    hour >= 12 && hour < 17 ? ["Good afternoon", "🌤️"] :
    hour >= 17 && hour < 22 ? ["Good evening", "🌆"] : ["Good night", "🌙"];
  const f = Math.round(c.temperature_2m * 9 / 5 + 32);
  const cel = Math.round(c.temperature_2m);
  $("greeting").innerHTML = `${hello}, ${USER_NAME}! ${icon}<span class="both">It's ${f}°F (${cel}°C) in ${state.place.name} right now.</span>`;
}

function compassDir(deg) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}
function uvText(uv) {
  return uv < 3 ? "Low" : uv < 6 ? "Moderate — sunscreen is a good idea" : uv < 8 ? "High — wear sunscreen" : uv < 11 ? "Very high" : "Extreme";
}
function aqiText(a) {
  return a <= 50 ? "Good" : a <= 100 ? "Moderate" : a <= 150 ? "Unhealthy for sensitive groups" : a <= 200 ? "Unhealthy" : "Very unhealthy";
}

function wearTip(c, d) {
  const t = c.apparent_temperature;
  const rain = d.daily.precipitation_probability_max[0] ?? 0;
  let tip =
    t < -10 ? "Heavy winter coat, hat, gloves and a scarf. Boston winter is no joke." :
    t < 0 ? "Winter coat, hat and gloves." :
    t < 8 ? "A warm jacket and layers." :
    t < 15 ? "A light jacket or sweater." :
    t < 22 ? "Long sleeves or a light layer." :
    t < 28 ? "T-shirt weather." : "Light, breathable clothes. Stay hydrated!";
  if (rain >= 50) tip += " Bring an umbrella ☔.";
  if (kind(c.weather_code) === "snow") tip += " Waterproof boots recommended.";
  return tip;
}

function funTip(c, d, hi) {
  const next = d.hourly.precipitation_probability.slice(hi, hi + 12);
  const rainAt = next.findIndex((p) => p >= 60);
  if (kind(c.weather_code) === "rain") {
    const dryAt = next.findIndex((p) => p < 30);
    return dryAt > 0 ? `Rain should ease around ${hourLabel(d.hourly.time[hi + dryAt])}.` : "Rainy for a while. Good day for the MIT Museum or a café in Harvard Square.";
  }
  if (rainAt > 0) return `Rain likely around ${hourLabel(d.hourly.time[hi + rainAt])}. Plan accordingly!`;
  const temps = d.hourly.temperature_2m.slice(hi, hi + 24);
  const maxI = temps.indexOf(Math.max(...temps));
  return `Warmest in the next 24h: ${tempStr(temps[maxI])} around ${hourLabel(d.hourly.time[hi + maxI])}.`;
}

// ---------- what to wear ----------
// Bands use "feels like" in °C: 0 extreme cold … 6 hot.
function band(feelsC) {
  return feelsC <= -10 ? 0 : feelsC <= 0 ? 1 : feelsC <= 7 ? 2 : feelsC <= 13 ? 3 : feelsC <= 18 ? 4 : feelsC <= 24 ? 5 : 6;
}
const ul = (items) => items.map((x) => `<li>${x}</li>`).join("");

// Conditions for today's daytime (7am–7pm) or the rest of today if later.
function dayConditions(d, hi) {
  const today = d.hourly.time[hi].slice(0, 10);
  let idx = d.hourly.time.map((t, i) => i).filter((i) => d.hourly.time[i].startsWith(today) && +d.hourly.time[i].slice(11, 13) >= 7 && +d.hourly.time[i].slice(11, 13) <= 19 && i >= hi);
  if (!idx.length) idx = [hi, hi + 1, hi + 2].filter((i) => i < d.hourly.time.length);
  return conditions(d, idx);
}
function dayIdxHours(d, hi) {
  const today = d.hourly.time[hi].slice(0, 10);
  const idx = [];
  for (let i = hi; i < d.hourly.time.length && d.hourly.time[i].startsWith(today); i++) idx.push(i);
  return idx.length ? idx : [hi];
}
function conditions(d, idx) {
  const pick = (arr) => idx.map((i) => arr[i] ?? 0);
  const codes = pick(d.hourly.weather_code);
  return {
    feelsMin: Math.min(...pick(d.hourly.apparent_temperature)),
    feelsMax: Math.max(...pick(d.hourly.apparent_temperature)),
    rain: Math.max(...pick(d.hourly.precipitation_probability)),
    wind: Math.max(...pick(d.hourly.wind_speed_10m)),
    uv: Math.max(...pick(d.hourly.uv_index)),
    snow: codes.some((c) => kind(c) === "snow"),
    wet: codes.some((c) => ["rain", "storm"].includes(kind(c))),
  };
}

function adultWear(k) {
  const b = band(k.feelsMin);
  const layers = [
    ["<b>Base:</b> thermal top + leggings", "<b>Mid:</b> wool or fleece sweater", "<b>Outer:</b> long down parka with a hood"],
    ["<b>Base:</b> thermal or long-sleeve top", "<b>Mid:</b> fleece or wool sweater", "<b>Outer:</b> insulated winter coat"],
    ["<b>Base:</b> long-sleeve top", "<b>Mid:</b> sweater or fleece", "<b>Outer:</b> warm puffer jacket"],
    ["<b>Base:</b> long-sleeve top", "<b>Mid:</b> light sweater (easy to take off)", "<b>Outer:</b> light jacket or trench"],
    ["T-shirt + a light layer (cardigan, denim or light jacket)", "Jeans or long pants"],
    ["T-shirt, light pants or a skirt", "A light layer for the evening"],
    ["Light, breathable clothes (cotton/linen), shorts or a dress", "Drink plenty of water"],
  ][b];
  const shoes = [
    "<b>Shoes:</b> insulated waterproof winter boots + wool socks",
    k.snow || k.wet ? "<b>Shoes:</b> waterproof winter boots + wool socks" : "<b>Shoes:</b> warm boots + wool socks",
    k.snow ? "<b>Shoes:</b> waterproof snow boots" : k.wet ? "<b>Shoes:</b> waterproof boots" : "<b>Shoes:</b> ankle boots or warm sneakers",
    k.wet ? "<b>Shoes:</b> waterproof boots or rain boots" : "<b>Shoes:</b> closed sneakers or ankle boots",
    k.wet ? "<b>Shoes:</b> waterproof sneakers or rain boots" : "<b>Shoes:</b> sneakers",
    k.wet ? "<b>Shoes:</b> closed shoes that can get wet" : "<b>Shoes:</b> sneakers or sandals",
    "<b>Shoes:</b> sandals or breathable sneakers",
  ][b];
  const extra = [];
  if (b <= 1) extra.push("<b>Accessories:</b> warm hat over the ears, insulated gloves, scarf or neck warmer");
  else if (b === 2) extra.push("<b>Accessories:</b> light hat and gloves");
  if (k.wet || k.rain >= 50) extra.push("☔ Waterproof shell or raincoat + umbrella");
  if (k.wind >= 30) extra.push("💨 Windy — make the outer layer windproof");
  if (k.uv >= 6) extra.push("🕶️ Sunglasses and sunscreen");
  if (k.feelsMax - k.feelsMin >= 8) extra.push(`Big swing today (${tempStr(k.feelsMin)} → ${tempStr(k.feelsMax)}) — dress in layers you can remove`);
  return [...layers, shoes, ...extra];
}

function kidsWear(k) {
  const b = band(k.feelsMin);
  const items = [
    ["Thermal base layer under clothes", "Warm sweater or fleece", "Heavy winter coat" + (k.snow ? " + snow pants" : ""), "<b>Shoes:</b> insulated snow boots + wool socks", "Hat over the ears, waterproof mittens or gloves, neck warmer"],
    ["Long-sleeve shirt + sweater or fleece", "Winter coat" + (k.snow ? " + snow pants for recess" : ""), "<b>Shoes:</b> " + (k.snow || k.wet ? "waterproof winter boots" : "warm boots") + " + warm socks", "Hat, gloves and a neck warmer"],
    ["Long-sleeve shirt + hoodie or sweater", "Puffer jacket", "<b>Shoes:</b> " + (k.snow ? "snow boots" : k.wet ? "rain boots or waterproof sneakers" : "sneakers or boots"), "Light hat and gloves in the backpack"],
    ["Long-sleeve shirt + light hoodie", "Light jacket", "<b>Shoes:</b> " + (k.wet ? "rain boots" : "sneakers")],
    ["T-shirt + hoodie or light jacket", "Long pants", "<b>Shoes:</b> " + (k.wet ? "rain boots" : "sneakers")],
    ["T-shirt, shorts or light pants", "<b>Shoes:</b> sneakers", "Water bottle"],
    ["Light T-shirt and shorts", "<b>Shoes:</b> sneakers or sport sandals", "Hat, sunscreen and a water bottle"],
  ][b].slice();
  if (k.wet || k.rain >= 50) items.push("☔ Raincoat with a hood");
  if (k.feelsMax - k.feelsMin >= 8) items.push("Pack an extra layer — it changes a lot during the day");
  if (k.uv >= 6 && b < 6) items.push("🧴 Sunscreen before school");
  return items;
}

function babyWear(k) {
  const b = band(k.feelsMin);
  const items = [
    ["Keep time outside short", "Thermal long-sleeve bodysuit + leggings", "Fleece footed one-piece", "Insulated snowsuit (bunting)", "Warm hat covering the ears, mittens, warm booties"],
    ["Long-sleeve bodysuit + leggings", "Fleece one-piece or sweater", "Snowsuit or puffer suit", "Warm hat over the ears, mittens", "<b>Shoes:</b> warm booties or insulated soft-soled shoes"],
    ["Long-sleeve bodysuit + pants", "Sweater or fleece", "Puffer or fleece suit", "Warm hat and mittens", "<b>Shoes:</b> warm booties or soft-soled shoes + warm socks"],
    ["Long-sleeve bodysuit + pants", "Light sweater or fleece jacket", "Light hat", "<b>Shoes:</b> socks + soft-soled shoes"],
    ["Bodysuit + long-sleeve top and pants", "Light cardigan", "<b>Shoes:</b> socks + soft-soled shoes"],
    ["Short-sleeve bodysuit + light pants", "Sun hat", "<b>Shoes:</b> light soft-soled shoes"],
    ["Light cotton bodysuit only", "Sun hat, stay in the shade", "Offer water and milk often"],
  ][b].slice();
  if (k.wet || k.rain >= 50) items.push("☔ Stroller rain cover");
  if (b <= 2) items.push("🚗 In the car seat: take off the puffy coat or snowsuit and put a blanket over the straps");
  items.push("Rule of thumb: one more layer than you. Feel the back of the neck — warm and dry is right, sweaty means too many layers");
  return items;
}

function renderWear(d, hi) {
  const k = dayConditions(d, hi);
  $("wear-basis").textContent = `Based on feels-like ${tempStr(k.feelsMin)}–${tempStr(k.feelsMax)}, ${k.rain}% chance of rain, wind up to ${speed(k.wind)}`;
  const ice = iceRisk(d, dayIdxHours(d, hi));
  const adult = adultWear(k), kids = kidsWear(k);
  if (ice.cleats) {
    adult.push("🧊 <b>Ice cleats (spikes) on boots</b> — " + ice.text.toLowerCase());
    kids.push("🧊 Boots with good grip — icy sidewalks today");
  }
  $("wear-ice").innerHTML = iceLine(ice);
  $("wear-ice").className = "ice-banner" + (ice.cleats ? " yes" : "");
  $("wear-adult").innerHTML = ul(adult);
  $("wear-kids").innerHTML = ul(kids);
  $("wear-baby").innerHTML = ul(babyWear(k));
}

// ---------- ice ----------
// Looks at the hours in `idx` plus the 12 hours before them (wet ground that freezes).
function iceRisk(d, idx) {
  const h = d.hourly;
  const first = Math.max(0, Math.min(...idx) - 12);
  const before = [];
  for (let i = first; i <= Math.max(...idx); i++) before.push(i);
  const val = (arr, i) => (arr && arr[i] != null ? arr[i] : null);
  const air = idx.map((i) => h.temperature_2m[i]);
  const ground = idx.map((i) => val(h.soil_temperature_0cm, i) ?? h.temperature_2m[i]);
  const minT = Math.min(...air, ...ground);
  const recentWet = before.some((i) => (val(h.precipitation, i) ?? 0) > 0.1);
  const comingWet = idx.some((i) => (h.precipitation_probability[i] ?? 0) >= 50);
  const snowOnGround = idx.some((i) => (val(h.snow_depth, i) ?? 0) > 0.005);
  const freezingRain = before.some((i) => [56, 57, 66, 67].includes(h.weather_code[i]));
  const thawRefreeze = snowOnGround && Math.max(...before.map((i) => h.temperature_2m[i])) > 1 && minT <= 0;

  if (freezingRain) return { level: 3, cleats: true, text: "Freezing rain — sidewalks will be icy" };
  if (minT <= 0 && (recentWet || comingWet)) return { level: 3, cleats: true, text: "Wet ground + below freezing — ice likely" };
  if (thawRefreeze) return { level: 2, cleats: true, text: "Snow melted and is refreezing — icy patches likely" };
  if (minT <= 0 && snowOnGround) return { level: 2, cleats: true, text: "Packed snow on the ground — slippery" };
  if (minT <= 2 && recentWet) return { level: 1, cleats: false, text: "Near freezing after wet weather — watch for black ice on shady spots" };
  if (minT <= 0) return { level: 1, cleats: false, text: "Below freezing but dry — ice unlikely" };
  return { level: 0, cleats: false, text: "Above freezing — no ice" };
}
function iceLine(r) {
  return r.cleats
    ? `🧊 <b>Ice: YES — put the ice cleats (spikes) on your boots.</b> ${r.text}.`
    : `✅ <b>Ice cleats: not needed.</b> ${r.text}.`;
}

// ---------- special events ----------
const nthWeekday = (y, m, weekday, n) => { // m: 0-11, weekday: 0=Sun
  const first = new Date(y, m, 1).getDay();
  return new Date(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
};
const EVENTS = [
  { name: "Halloween", icon: "🎃", date: (y) => new Date(y, 9, 31), costume: true,
    windows: [["Afternoon (parades & parties)", 12, 16], ["Trick-or-treating", 17, 20]] },
  { name: "Thanksgiving", icon: "🦃", date: (y) => nthWeekday(y, 10, 4, 4),
    windows: [["Morning walk / Turkey Trot", 8, 11], ["Evening", 17, 20]] },
  { name: "Christmas Eve", icon: "🎄", date: (y) => new Date(y, 11, 24),
    windows: [["Afternoon", 12, 16], ["Evening (lights & services)", 17, 21]] },
  { name: "New Year's Eve", icon: "🎆", date: (y) => new Date(y, 11, 31),
    windows: [["Evening (First Night Boston)", 18, 21], ["Midnight fireworks", 22, 23]] },
  { name: "Boston Marathon", icon: "🏃", date: (y) => nthWeekday(y, 3, 1, 3),
    windows: [["Watching the race", 9, 14]] },
  { name: "Fourth of July", icon: "🇺🇸", date: (y) => new Date(y, 6, 4),
    windows: [["Afternoon on the Esplanade", 13, 17], ["Fireworks", 20, 22]] },
];
const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

function costumeTips(k, dark, wet) {
  const b = band(k.feelsMin);
  const adult = [], kids = [], baby = [];
  if (b <= 1) {
    adult.push("<b>Under the costume:</b> thermal top + leggings", "<b>Over:</b> a warm coat — pick one that matches the costume colors, or make it part of the costume", "Warm hat under the hood/headpiece, gloves");
    kids.push("<b>Under the costume:</b> thermal long-sleeve + leggings + warm socks (buy the costume a size up so it fits over)", "<b>Over:</b> winter coat — turn it into part of the costume (cape, ears on the hood)", "Gloves and a hat in costume colors", "<b>Shoes:</b> warm boots, not costume shoes");
    baby.push("<b>Under:</b> fleece footed one-piece", "<b>Over:</b> a bunting-style (sack) costume, or the costume over the snowsuit", "Costume hat that covers the ears + mittens", "In the stroller: keep the thermal sack on, costume hat on top");
  } else if (b === 2) {
    adult.push("<b>Under the costume:</b> long-sleeve thermal top", "<b>Over:</b> a puffer or warm jacket you can take off indoors", "Light gloves");
    kids.push("<b>Under the costume:</b> long-sleeve shirt + leggings (costume a size up)", "<b>Over:</b> a light puffer or fleece — easy to carry when they warm up", "<b>Shoes:</b> comfortable sneakers or boots for walking", "Light gloves");
    baby.push("<b>Under:</b> long-sleeve bodysuit + leggings", "<b>Over:</b> a fleece costume, or costume over a fleece suit", "Warm hat (costume hat counts if it covers the ears) + mittens", "Thermal sack in the stroller");
  } else if (b === 3) {
    adult.push("<b>Under the costume:</b> long-sleeve top", "<b>Over:</b> a light jacket or sweater");
    kids.push("<b>Under the costume:</b> long-sleeve shirt", "<b>Over:</b> a hoodie or light jacket for later", "<b>Shoes:</b> comfortable sneakers");
    baby.push("<b>Under:</b> long-sleeve bodysuit + pants", "Costume + a light hat; blanket in the stroller");
  } else {
    adult.push("Costume as is — maybe a light layer for later");
    kids.push("Costume as is — avoid heavy masks if it's warm; bring water", "<b>Shoes:</b> comfortable sneakers");
    baby.push("Light costume over a short-sleeve bodysuit", "Watch for overheating in fleece costumes");
  }
  if (wet) {
    adult.push("☔ Clear poncho or umbrella (shows off the costume)");
    kids.push("☔ Clear rain poncho over the costume + rain boots");
    baby.push("☔ Stroller rain cover");
  }
  if (dark) kids.push("🔦 Dark out — glow sticks, reflective tape on the costume or bag, and a flashlight");
  return { adult, kids, baby };
}

function eventWindow(d, date, from, to) {
  const idx = [];
  for (let h = from; h <= to; h++) {
    const i = d.hourly.time.indexOf(`${date}T${pad(h)}:00`);
    if (i >= 0) idx.push(i);
  }
  return idx;
}

function renderEvents(d) {
  const first = d.daily.time[0], last = d.daily.time[d.daily.time.length - 1];
  const y = +first.slice(0, 4);
  const all = [];
  for (const yr of [y, y + 1]) for (const e of EVENTS) all.push({ ...e, day: ymd(e.date(yr)) });
  all.sort((a, b) => a.day.localeCompare(b.day));
  const inRange = all.filter((e) => e.day >= first && e.day <= last);
  const next = all.find((e) => e.day > last);

  let html = "";
  for (const e of inRange) {
    const di = d.daily.time.indexOf(e.day);
    const dateLabel = parseLocal(e.day + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const sunset = d.daily.sunset[di];
    const windows = e.windows.map(([label, from, to]) => {
      const idx = eventWindow(d, e.day, from, to);
      if (!idx.length) return "";
      const k = conditions(d, idx);
      const temps = idx.map((i) => d.hourly.temperature_2m[i]);
      const wet = k.wet || k.rain >= 50;
      const dark = `${pad(to)}:00` > sunset.slice(11, 16);
      const ice = iceRisk(d, idx);
      const timeLabel = `${hourLabel(`${e.day}T${pad(from)}:00`)}–${hourLabel(`${e.day}T${pad(to)}:00`)}`;
      const w = wmo(d.hourly.weather_code[idx[0]], d.hourly.is_day[idx[0]]);
      let chips = [`${w.icon} ${w.text}`, `🌡️ ${bothRange(Math.min(...temps), Math.max(...temps))}`, `Feels like ${bothStr(k.feelsMin)}`, `💧 ${k.rain}% rain`, `💨 ${speed(k.wind)}`]
        .map((x) => `<span>${x}</span>`).join("");
      if (dark) chips += `<span class="warn">🌇 Sunset ${clockLabel(sunset)} — dark during this time</span>`;
      if (ice.cleats) chips += `<span class="warn">${iceLine(ice)}</span>`;
      let body;
      if (e.costume) {
        const t = costumeTips(k, dark, wet);
        body = `<div class="who">🧑 Adults</div><ul>${ul(t.adult)}</ul><div class="who">🧒 Kids (9)</div><ul>${ul(t.kids)}</ul><div class="who">👶 Baby (1)</div><ul>${ul(t.baby)}</ul>`;
      } else {
        body = `<div class="who">🧑 Adults</div><ul>${ul(adultWear(k).filter((x) => !x.startsWith("Big swing")))}</ul><div class="who">🧒 Kids (9)</div><ul>${ul(kidsWear(k))}</ul><div class="who">👶 Baby (1)</div><ul>${ul(babyWear(k).slice(0, -1))}</ul>`;
      }
      return `<div class="event-window"><h4>${label} · ${timeLabel}</h4><div class="walk-summary">${chips}</div>${body}</div>`;
    }).join("");
    html += `<div class="event"><h3 class="event-title">${e.icon} ${e.name} — ${dateLabel}</h3><div class="event-windows">${windows}</div></div>`;
  }
  if (next) {
    const dateLabel = parseLocal(next.day + "T12:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const days = Math.round((parseLocal(next.day + "T12:00") - parseLocal(last + "T12:00")) / 86400000);
    html += `<p class="muted small">Next up: ${next.icon} <b>${next.name}</b> on ${dateLabel} — the forecast and outfit tips will show up here about a week before (in ${days} more day${days === 1 ? "" : "s"}).</p>`;
  }
  $("events").innerHTML = html;
}

// ---------- morning walk 6:30–7:30 ----------
function renderWalk(d) {
  const nowStr = d.current.time;
  const useToday = nowStr.slice(11, 16) < "07:30";
  const dayIdx = useToday ? 0 : 1;
  const date = d.daily.time[dayIdx];
  const idx = ["06", "07"].map((h) => d.hourly.time.indexOf(`${date}T${h}:00`)).filter((i) => i >= 0);
  if (!idx.length) { $("walk-summary").textContent = "No forecast for the walk window yet."; return; }
  const k = conditions(d, idx);
  const temps = idx.map((i) => d.hourly.temperature_2m[i]);
  const sunrise = d.daily.sunrise[dayIdx];
  const dark = sunrise.slice(11, 16) > "06:30";
  const b = band(k.feelsMin);
  const w = wmo(d.hourly.weather_code[idx[0]], d.hourly.is_day[idx[0]]);

  $("walk-when").textContent = `${useToday ? "This morning" : "Tomorrow"} · 6:30–7:30 AM`;
  const chips = [
    `${w.icon} ${w.text}`,
    `🌡️ ${bothRange(Math.min(...temps), Math.max(...temps))}`,
    `Feels like ${bothStr(k.feelsMin)}`,
    `💧 ${k.rain}% rain`,
    `💨 ${speed(k.wind)}`,
    `🌅 Sunrise ${clockLabel(sunrise)}`,
  ];
  let summary = chips.map((x) => `<span>${x}</span>`).join("");
  const ice = iceRisk(d, idx);
  summary += `<span class="${ice.cleats ? "warn" : ""}">${iceLine(ice)}</span>`;
  if (b === 0) summary += `<span class="warn">🥶 Very cold — keep the walk short (10–15 min) or walk later</span>`;
  if (k.rain >= 60) summary += `<span class="warn">☔ Rain likely — bring the rain cover</span>`;
  if (dark) summary += `<span class="warn">🌑 Still dark until ${clockLabel(sunrise)} — wear something reflective</span>`;
  $("walk-summary").innerHTML = summary;

  const me = adultWear(k).filter((x) => !x.startsWith("Big swing"));
  if (b <= 2) me.push("🧤 Warm gloves or stroller hand muffs — hands on the handle get cold fast");
  if (dark) me.push("🔦 Reflective vest or stroller light");
  if (ice.cleats) me.push("🧊 <b>Ice cleats on your boots</b> — and push the stroller slowly, ice is worst on curb ramps and shady corners");
  $("walk-me").innerHTML = ul(me);

  const baby = [
    ["<b>Inside the sack:</b> thermal long-sleeve bodysuit + fleece footed one-piece", "<b>Head:</b> warm knit hat over the ears + neck warmer or balaclava", "<b>Hands:</b> warm mittens", "<b>Feet:</b> warm socks + booties", "Close the sack fully and use the wind/rain cover to keep warmth in"],
    ["<b>Inside the sack:</b> long-sleeve bodysuit + fleece footed one-piece", "<b>Head:</b> warm knit hat over the ears", "<b>Hands:</b> mittens", "<b>Feet:</b> warm socks or booties", "Wind cover on if it's breezy"],
    ["<b>Inside the sack:</b> long-sleeve bodysuit + footed sleeper (or sweater + leggings)", "<b>Head:</b> warm hat over the ears", "<b>Hands:</b> mittens", "<b>Feet:</b> socks"],
    ["<b>Inside the sack:</b> long-sleeve bodysuit + pants", "<b>Head:</b> light cotton hat", "<b>Hands:</b> mittens optional", "Sack can be partly unzipped if he gets warm"],
    ["The thermal sack is probably too warm — use a light blanket instead", "Long-sleeve outfit + light hat"],
    ["Skip the thermal sack — light outfit and a thin blanket", "Sun canopy up"],
    ["Skip the thermal sack — light cotton only", "Canopy up, keep him in the shade"],
  ][b].slice();
  if (k.rain >= 50 || k.wet) baby.push("☔ Stroller rain cover");
  baby.push("Don't stack a snowsuit inside the thermal sack unless it's extremely cold — check the neck for sweat");
  $("walk-baby").innerHTML = ul(baby);
}

function renderAlerts(d, hi) {
  const out = [];
  const max = d.daily.temperature_2m_max[0], min = d.daily.temperature_2m_min[0];
  if (max >= 32) out.push(`🔥 Heat alert: up to ${tempStr(max)} today.`);
  if (min <= -12) out.push(`🥶 Extreme cold: down to ${tempStr(min)} tonight.`);
  if (d.daily.wind_gusts_10m_max[0] >= 60) out.push(`💨 Strong gusts up to ${speed(d.daily.wind_gusts_10m_max[0])} today.`);
  if (d.daily.weather_code.slice(0, 2).some((x) => [95, 96, 99].includes(x))) out.push("⛈️ Thunderstorms possible in the next two days.");
  if (d.daily.weather_code.slice(0, 2).some((x) => [73, 75, 86].includes(x))) out.push("❄️ Significant snow possible in the next two days.");
  if (Math.max(...d.hourly.uv_index.slice(hi, hi + 12)) >= 8) out.push("🧴 Very high UV later today. Wear sunscreen.");
  const ice = iceRisk(d, dayIdxHours(d, hi));
  if (ice.cleats) out.unshift(`🧊 Icy sidewalks today — wear ice cleats. ${ice.text}.`);
  $("alerts").innerHTML = out.map((t) => `<div class="alert">${t}</div>`).join("");
}

function renderHourly(d, hi) {
  let html = "";
  let lastDate = d.hourly.time[hi].slice(0, 10);
  for (let i = hi; i < hi + state.hours && i < d.hourly.time.length; i++) {
    const t = d.hourly.time[i];
    if (t.slice(0, 10) !== lastDate) {
      lastDate = t.slice(0, 10);
      const label = parseLocal(lastDate + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      html += `<tr class="day-row"><td colspan="7">${label}</td></tr>`;
    }
    const w = wmo(d.hourly.weather_code[i], d.hourly.is_day[i]);
    const p = d.hourly.precipitation_probability[i] ?? 0;
    html += `<tr class="${i === hi ? "is-now" : ""}">
      <td>${i === hi ? "<b>Now</b>" : hourLabel(t)}</td>
      <td title="${w.text}">${w.icon}</td>
      <td><b>${tempStr(d.hourly.temperature_2m[i])}</b></td>
      <td>${tempStr(d.hourly.apparent_temperature[i])}</td>
      <td class="${p >= 50 ? "rain-hi" : ""}">${p}%</td>
      <td>${speed(d.hourly.wind_speed_10m[i])}</td>
      <td class="hide-sm">${w.text}</td></tr>`;
  }
  $("hourly").innerHTML = html;
  $("more-hours").textContent = state.hours === 24 ? "Show next 48 hours" : "Show next 24 hours only";
}

function renderChart(d, hi) {
  const end = Math.min(hi + 24, d.hourly.time.length);
  const times = d.hourly.time.slice(hi, end);
  const metric = state.metric;
  const raw =
    metric === "temp" ? d.hourly.temperature_2m.slice(hi, end).map(temp) :
    metric === "rain" ? d.hourly.precipitation_probability.slice(hi, end).map((v) => v ?? 0) :
    d.hourly.wind_speed_10m.slice(hi, end).map((v) => state.unit === "F" ? v * 0.621371 : v);
  const label = (v) => metric === "temp" ? `${Math.round(v)}°` : metric === "rain" ? `${Math.round(v)}%` : Math.round(v);

  const W = 700, H = 150, P = 22;
  let lo = Math.min(...raw), hiV = Math.max(...raw);
  if (metric === "rain") { lo = 0; hiV = 100; }
  if (hiV - lo < 1) { hiV += 1; lo -= 1; }
  const x = (i) => P + (i * (W - 2 * P)) / (raw.length - 1);
  const y = (v) => H - P - ((v - lo) / (hiV - lo)) * (H - 2 * P);
  const pts = raw.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = metric === "temp" ? "#ff8a3d" : metric === "rain" ? "#3b82f6" : "#14b8a6";

  let labels = "";
  raw.forEach((v, i) => {
    if (i % 3 === 0) {
      labels += `<text x="${x(i)}" y="${y(v) - 8}" text-anchor="middle" font-size="12" fill="currentColor" font-weight="600">${label(v)}</text>`;
      labels += `<text x="${x(i)}" y="${H}" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">${i === 0 ? "Now" : hourLabel(times[i])}</text>`;
    }
  });

  $("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H + 6}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="${x(0)},${H - P} ${pts} ${x(raw.length - 1)},${H - P}" fill="url(#g)"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${labels}</svg>`;
}

function renderDaily(d) {
  const allLo = Math.min(...d.daily.temperature_2m_min), allHi = Math.max(...d.daily.temperature_2m_max);
  const span = allHi - allLo || 1;
  $("daily").innerHTML = d.daily.time.map((t, i) => {
    const w = wmo(d.daily.weather_code[i]);
    const lo = d.daily.temperature_2m_min[i], hi = d.daily.temperature_2m_max[i];
    const p = d.daily.precipitation_probability_max[i] ?? 0;
    const date = parseLocal(t + "T12:00");
    const day = i === 0 ? "Today" : i === 1 ? "Tomorrow" : date.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `<li data-i="${i}">
      <span class="day">${day}<small>${dateStr}</small></span><span class="ic" title="${w.text}">${w.icon}</span>
      <span class="lo">${tempStr(lo)}</span>
      <div class="range"><span style="left:${((lo - allLo) / span) * 100}%;width:${((hi - lo) / span) * 100}%"></span></div>
      <span class="hi">${tempStr(hi)}</span>
      <div class="detail"><b>${w.text}</b> · 💧 ${p}% chance of ${kind(d.daily.weather_code[i]) === "snow" ? "snow" : "rain"}${d.daily.precipitation_sum[i] > 0.2 ? ` (${precip(d.daily.precipitation_sum[i])})` : ""} · 💨 up to ${speed(d.daily.wind_speed_10m_max[i])} · UV ${d.daily.uv_index_max[i]?.toFixed(0) ?? "-"} · 🌅 ${clockLabel(d.daily.sunrise[i])}</div>
    </li>`;
  }).join("");
}

function renderSun(d) {
  const rise = parseLocal(d.daily.sunrise[0]), set = parseLocal(d.daily.sunset[0]);
  const now = parseLocal(d.current.time);
  const mins = Math.round((set - rise) / 60000);
  $("sunrise").textContent = clockLabel(d.daily.sunrise[0]);
  $("sunset").textContent = clockLabel(d.daily.sunset[0]);
  $("daylength").textContent = `${Math.floor(mins / 60)}h ${mins % 60}m of daylight`;

  const f = Math.max(0, Math.min(1, (now - rise) / (set - rise)));
  const cx = 150, cy = 120, r = 110;
  const ang = Math.PI * (1 - f);
  const sx = cx + r * Math.cos(ang), sy = cy - r * Math.sin(ang);
  const up = now > rise && now < set;
  $("sun-arc").innerHTML = `
    <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="5 6"/>
    <line x1="10" y1="${cy}" x2="290" y2="${cy}" stroke="currentColor" stroke-opacity="0.3"/>
    ${up ? `<circle cx="${sx}" cy="${sy}" r="16" fill="#ffd34d" opacity="0.35"/><circle cx="${sx}" cy="${sy}" r="9" fill="#ffb800"/>`
         : `<text x="${cx}" y="${cy - 40}" text-anchor="middle" font-size="13" fill="currentColor" opacity="0.7">The sun is down 🌙</text>`}`;
}

function renderMoon() {
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((Date.now() - knownNew) / 86400000) % synodic + synodic) % synodic;
  const phase = age / synodic;
  const names = [
    ["New Moon", "🌑"], ["Waxing Crescent", "🌒"], ["First Quarter", "🌓"], ["Waxing Gibbous", "🌔"],
    ["Full Moon", "🌕"], ["Waning Gibbous", "🌖"], ["Last Quarter", "🌗"], ["Waning Crescent", "🌘"],
  ];
  const [name, icon] = names[Math.round(phase * 8) % 8];
  const illum = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);
  const toFull = Math.round(((0.5 - phase + 1) % 1) * synodic);
  $("moon-icon").textContent = icon;
  $("moon-name").textContent = name;
  $("moon-illum").textContent = `${illum}% illuminated · ${toFull === 0 ? "full tonight!" : `full moon in ${toFull} day${toFull === 1 ? "" : "s"}`}`;
}

function renderActivities(c, d, hi, uv) {
  const t = c.apparent_temperature, wind = c.wind_speed_10m;
  const rain = Math.max(...d.hourly.precipitation_probability.slice(hi, hi + 3).map((v) => v ?? 0));
  const wet = kind(c.weather_code) === "rain" || kind(c.weather_code) === "storm" || kind(c.weather_code) === "snow";
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const comfy = (ideal, tol) => 100 - Math.abs(t - ideal) * (100 / tol);
  const list = [
    ["🏃 Run along the Charles", comfy(12, 22) - rain * 0.5 - Math.max(0, wind - 25) - (wet ? 40 : 0)],
    ["🚣 Kayak on the Charles", comfy(24, 14) - wind * 1.5 - rain * 0.6 - (wet ? 50 : 0)],
    ["🚲 Bike the Minuteman", comfy(18, 18) - Math.max(0, wind - 15) * 2 - rain * 0.6 - (wet ? 40 : 0)],
    ["🧺 Picnic on Cambridge Common", comfy(23, 12) - rain * 0.8 - wind - (c.is_day ? 0 : 60) - (wet ? 50 : 0)],
    ["☕ Harvard Square café hop", 70 + (wet ? 25 : 0) + (t < 5 ? 15 : 0)],
    ["🔭 Stargazing", (c.is_day ? 0 : 100 - c.cloud_cover) - rain * 0.5],
    ["📸 Photo walk (golden hour)", 100 - c.cloud_cover * 0.4 - rain * 0.7 - (wet ? 30 : 0) - Math.max(0, uv - 8) * 5],
  ];
  $("activities").innerHTML = list.map(([name, s]) => {
    const v = clamp(s);
    const col = v >= 70 ? "#22c55e" : v >= 40 ? "#eab308" : "#ef4444";
    const word = v >= 70 ? "Great" : v >= 40 ? "OK" : "Not ideal";
    return `<div class="activity"><div class="name">${name}</div>
      <div class="score"><span style="width:${v}%;background:${col}"></span></div>
      <div class="muted small">${word} · ${v}/100</div></div>`;
  }).join("");
}

function renderSky(c) {
  const k = kind(c.weather_code);
  const night = !c.is_day;
  const skies = {
    clear: night ? ["#0b1736", "#28345e"] : ["#4aa3ff", "#cfe9ff"],
    cloud: night ? ["#1b2233", "#3a4256"] : ["#8fb3d9", "#e3ecf5"],
    rain: night ? ["#141a26", "#2f3a4d"] : ["#5f7894", "#b9c7d6"],
    storm: ["#1f1c2c", "#4b4a5e"],
    snow: night ? ["#26324a", "#5d6c87"] : ["#b8c9de", "#f2f6fb"],
    fog: night ? ["#2a2f38", "#4c525c"] : ["#b7bfc8", "#e8ebee"],
  };
  const [top, bottom] = skies[k];
  document.documentElement.style.setProperty("--sky-top", top);
  document.documentElement.style.setProperty("--sky-bottom", bottom);
  if (!state.theme) document.documentElement.dataset.theme = night || k === "storm" ? "dark" : "light";

  const box = $("particles");
  box.innerHTML = "";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const add = (cls, n, fn) => { for (let i = 0; i < n; i++) { const e = document.createElement("span"); e.className = cls; fn(e, i); box.appendChild(e); } };
  if (k === "rain" || k === "storm") add("drop", 90, (e) => {
    e.style.left = `${Math.random() * 100}vw`;
    e.style.animationDuration = `${0.5 + Math.random() * 0.5}s`;
    e.style.animationDelay = `${-Math.random() * 2}s`;
  });
  if (k === "snow") add("flake", 60, (e) => {
    e.textContent = "❄";
    e.style.left = `${Math.random() * 100}vw`;
    e.style.fontSize = `${8 + Math.random() * 14}px`;
    e.style.animationDuration = `${6 + Math.random() * 6}s, ${2 + Math.random() * 2}s`;
    e.style.animationDelay = `${-Math.random() * 10}s, 0s`;
  });
  if (night && (k === "clear" || k === "cloud")) add("star", 80, (e) => {
    e.style.left = `${Math.random() * 100}vw`;
    e.style.top = `${Math.random() * 70}vh`;
    e.style.animationDelay = `${-Math.random() * 3}s`;
  });
  if (k === "cloud") add("cloud-p", 4, (e, i) => {
    e.textContent = "☁️";
    e.style.top = `${5 + i * 15}vh`;
    e.style.animationDuration = `${60 + Math.random() * 60}s`;
    e.style.animationDelay = `${-Math.random() * 100}s`;
  });
}

function tickClock() {
  if (!state.data) return;
  $("local-time").textContent = new Date().toLocaleString("en-US", {
    timeZone: state.data.timezone, weekday: "long", hour: "numeric", minute: "2-digit",
  }) + ` · ${state.data.timezone_abbreviation}`;
}

// ---------- interactions ----------
function setPlace(place) {
  state.place = place;
  saveJSON("place", place);
  load();
}

$("unit-btn").addEventListener("click", () => {
  state.unit = state.unit === "F" ? "C" : "F";
  saveJSON("unit", state.unit);
  render();
});

$("theme-btn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  state.theme = next;
  saveJSON("theme", next);
  document.documentElement.dataset.theme = next;
});

$("home-btn").addEventListener("click", () => setPlace(HOME));

$("locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Location isn't available in this browser.");
  navigator.geolocation.getCurrentPosition(
    (pos) => setPlace({ name: "My location", lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => alert("Couldn't get your location."),
  );
});

document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
  state.metric = btn.dataset.metric;
  if (state.data) renderChart(state.data, currentHourIndex(state.data));
}));

$("more-hours").addEventListener("click", () => {
  state.hours = state.hours === 24 ? 48 : 24;
  if (state.data) renderHourly(state.data, currentHourIndex(state.data));
});

let searchTimer;
const results = $("search-results");
$("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { results.hidden = true; return; }
  searchTimer = setTimeout(async () => {
    const list = await searchCities(q).catch(() => []);
    results.innerHTML = list.length
      ? list.map((r, i) => `<li data-i="${i}">${r.name}${r.admin1 ? ", " + r.admin1 : ""} <span class="muted small">${r.country || ""}</span></li>`).join("")
      : `<li class="muted">No matches</li>`;
    results.hidden = false;
    results.onclick = (ev) => {
      const li = ev.target.closest("li[data-i]");
      if (!li) return;
      const r = list[+li.dataset.i];
      const region = r.country_code === "US" && r.admin1 ? r.admin1 : r.country;
      setPlace({ name: `${r.name}${region ? ", " + region : ""}`, lat: r.latitude, lon: r.longitude });
      results.hidden = true;
      $("search-input").value = "";
    };
  }, 300);
});
$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  results.querySelector("li[data-i]")?.click();
});
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) results.hidden = true; });

// ---------- start ----------
if (state.theme) document.documentElement.dataset.theme = state.theme;
load();
setInterval(load, REFRESH_MS);
setInterval(tickClock, 30 * 1000);
