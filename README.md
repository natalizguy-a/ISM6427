# ISM6427 — SkyCast Weather

A weather app for **Cambridge, Massachusetts** (you can also search any city). It's plain HTML, CSS and JavaScript, uses the free [Open-Meteo](https://open-meteo.com/) API, and needs no API key and no build step.

## Features
- Current conditions with an animated sky that changes with the weather and time of day (rain, snow, stars, clouds)
- Feels-like, humidity, wind with a compass, UV index, air quality (US AQI), pressure
- 24-hour chart you can switch between temperature, chance of rain and wind, plus hourly cards
- 7-day forecast with temperature range bars; tap a day for details
- Sunrise/sunset with the sun's current position on an arc, and the moon phase
- "What to wear" advice and a rain-timing tip
- Automatic weather alerts (heat, cold, strong gusts, storms, snow, high UV)
- Cambridge activity planner (Charles River run, kayaking, Minuteman bike path, and more)
- City search, "use my location", °F/°C switch and light/dark mode (remembered between visits)
- Refreshes every 10 minutes; works on phones

## Run locally
Open `index.html` in a browser, or run `npx serve .`

## Deploy
Netlify deploys it as-is (`netlify.toml` publishes the repository root).
