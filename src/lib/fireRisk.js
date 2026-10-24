import { SURIGAO_CENTER } from '../data/surigao.js';

const API = 'https://api.open-meteo.com/v1/forecast';

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

/**
 * A city-level weather screening index, not a prediction of ignition.
 * Keep the map marker on Surigao City; expose the coarser Open-Meteo grid
 * coordinate separately so it is not mistaken for a precise fire-start site.
 */
export async function fetchSurigaoFireRisk() {
  const url = new URL(API);
  url.search = new URLSearchParams({
    latitude: String(SURIGAO_CENTER[0]),
    longitude: String(SURIGAO_CENTER[1]),
    current: 'temperature_2m,relative_humidity_2m,precipitation',
    past_days: '3',
    hourly: 'temperature_2m,precipitation',
    timezone: 'Asia/Manila',
    forecast_days: '1',
  });

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [payload];

  return rows.slice(0, 1).map((weather) => {
    const current = weather?.current ?? {};
    const temperature = Number(current.temperature_2m);
    const humidity = Number(current.relative_humidity_2m);
    const precipitation = Number(current.precipitation);
    const hourlyTemperatures = weather?.hourly?.temperature_2m ?? [];
    const rainSeries = weather?.hourly?.precipitation ?? [];
    const rainTimes = weather?.hourly?.time ?? [];
    const currentTimestamp = current.time ? Date.parse(current.time) : Number.NaN;
    const currentHour = Number.isFinite(currentTimestamp)
      ? rainTimes.reduce((last, time, index) => Date.parse(time) <= currentTimestamp ? index : last, -1)
      : -1;
    const end = currentHour >= 0 ? currentHour + 1 : Math.max(0, rainSeries.length - 24);
    const start = Math.max(0, end - 72);
    const rainWindow = rainSeries.slice(start, end);
    const recentRain = rainWindow.length && rainWindow.some(Number.isFinite)
      ? rainWindow.reduce((sum, value) => sum + (Number(value) || 0), 0)
      : null;
    const recentTemperatures = hourlyTemperatures.slice(start, end)
      .map(Number).filter(Number.isFinite);
    const recentMeanTemp = recentTemperatures.length
      ? recentTemperatures.reduce((sum, value) => sum + value, 0) / recentTemperatures.length
      : null;
    const hasTemp = Number.isFinite(temperature);
    const hasHumidity = Number.isFinite(humidity);
    const hasRain = recentRain != null;
    const hasTempTrend = hasTemp && recentMeanTemp != null;

    // More heat and low humidity raise the weather component; recent rain
    // suppresses it. Fuel descriptors are relative screening inputs only.
    const absoluteHeat = hasTemp ? clamp((temperature - 24) / 13) : 0;
    const recentRise = hasTempTrend ? clamp((temperature - recentMeanTemp - 1) / 5) : 0;
    const heat = hasTempTrend ? 0.55 * absoluteHeat + 0.45 * recentRise : absoluteHeat;
    const dryness = hasHumidity ? clamp((75 - humidity) / 55) : 0;
    const drySpell = hasRain ? clamp(1 - recentRain / 35) : 0;
    const score = Math.round(100 * (0.30 * heat + 0.30 * dryness + 0.40 * drySpell));
    const completeness = [hasTemp, hasHumidity, hasRain, hasTempTrend].filter(Boolean).length / 4;
    const coverage = Math.round(completeness * 100);

    return {
      id: 'surigao-weather-grid',
      name: 'Surigao City area weather grid',
      location: SURIGAO_CENTER,
      modelGridLocation: [weather?.latitude ?? SURIGAO_CENTER[0], weather?.longitude ?? SURIGAO_CENTER[1]],
      score,
      coverage,
      temperature: hasTemp ? temperature : null,
      recentMeanTemp,
      tempRiseC: hasTempTrend ? temperature - recentMeanTemp : null,
      humidity: hasHumidity ? humidity : null,
      recentRain: hasRain ? recentRain : null,
      currentRain: Number.isFinite(precipitation) ? precipitation : null,
      observedAt: current.time ?? null,
      source: 'Open-Meteo weather model grid',
    };
  });
}
