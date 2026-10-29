// SkyCast — weather for Cambridge, MA (and anywhere else you search).
// Data from Open-Meteo (free, no API key). Values are fetched in metric
// and converted for display, so switching units needs no new request.

const USER_NAME = "נטלי";
const HOME = { name: "Cambridge, MA", lat: 42.3736, lon: -71.1097 };
const REFRESH_MS = 10 * 60 * 1000;

const state = {
  place: loadJSON("place") || HOME,
  unit: loadJSON("unit") || "F",
  theme: loadJSON("theme") || null,
  metric: "temp",
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
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day,wind_speed_10m,uv_index",
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

  $("wear-tip").innerHTML = `👕 <strong>What to wear:</strong> ${wearTip(c, d)}`;
  $("fun-tip").innerHTML = `💡 ${funTip(c, d, hi)}`;

  renderAlerts(d, hi);
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
    hour >= 5 && hour < 12 ? ["בוקר טוב", "☀️"] :
    hour >= 12 && hour < 17 ? ["צהריים טובים", "🌤️"] :
    hour >= 17 && hour < 22 ? ["ערב טוב", "🌆"] : ["לילה טוב", "🌙"];
  const f = Math.round(c.temperature_2m * 9 / 5 + 32);
  const cel = Math.round(c.temperature_2m);
  $("greeting").innerHTML = `${hello} ${USER_NAME}! ${icon}<span class="both">עכשיו <bdi>${f}°F</bdi> שזה <bdi>${cel}°C</bdi></span>`;
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

function renderAlerts(d, hi) {
  const out = [];
  const max = d.daily.temperature_2m_max[0], min = d.daily.temperature_2m_min[0];
  if (max >= 32) out.push(`🔥 Heat alert: up to ${tempStr(max)} today.`);
  if (min <= -12) out.push(`🥶 Extreme cold: down to ${tempStr(min)} tonight.`);
  if (d.daily.wind_gusts_10m_max[0] >= 60) out.push(`💨 Strong gusts up to ${speed(d.daily.wind_gusts_10m_max[0])} today.`);
  if (d.daily.weather_code.slice(0, 2).some((x) => [95, 96, 99].includes(x))) out.push("⛈️ Thunderstorms possible in the next two days.");
  if (d.daily.weather_code.slice(0, 2).some((x) => [73, 75, 86].includes(x))) out.push("❄️ Significant snow possible in the next two days.");
  if (Math.max(...d.hourly.uv_index.slice(hi, hi + 12)) >= 8) out.push("🧴 Very high UV later today. Wear sunscreen.");
  $("alerts").innerHTML = out.map((t) => `<div class="alert">${t}</div>`).join("");
}

function renderHourly(d, hi) {
  let html = "";
  for (let i = hi; i < hi + 24 && i < d.hourly.time.length; i++) {
    const w = wmo(d.hourly.weather_code[i], d.hourly.is_day[i]);
    const p = d.hourly.precipitation_probability[i] ?? 0;
    html += `<div class="hour"><div>${i === hi ? "Now" : hourLabel(d.hourly.time[i])}</div>
      <span class="ic" title="${w.text}">${w.icon}</span><strong>${tempStr(d.hourly.temperature_2m[i])}</strong>
      <div class="rain">${p >= 10 ? `💧${p}%` : "&nbsp;"}</div></div>`;
  }
  $("hourly").innerHTML = html;
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
    const day = i === 0 ? "Today" : parseLocal(t + "T12:00").toLocaleDateString("en-US", { weekday: "short" });
    return `<li data-i="${i}">
      <span>${day}</span><span class="ic" title="${w.text}">${w.icon}</span>
      <span class="lo">${tempStr(lo)}</span>
      <div class="range"><span style="left:${((lo - allLo) / span) * 100}%;width:${((hi - lo) / span) * 100}%"></span></div>
      <span class="hi">${tempStr(hi)}</span>
      <div class="detail" hidden>${w.text} · 💧 ${p}% chance, ${precip(d.daily.precipitation_sum[i])} · 💨 up to ${speed(d.daily.wind_speed_10m_max[i])} · UV ${d.daily.uv_index_max[i]?.toFixed(0) ?? "-"}</div>
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

$("daily").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) li.querySelector(".detail").hidden = !li.querySelector(".detail").hidden;
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
