const OUTLOOK_DAYS = 16;
const CLIMATE_START = 1991;
const CLIMATE_END = 2020;
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const NASA_POWER_MONTHLY_URL = 'https://power.larc.nasa.gov/api/temporal/monthly/point';
const CACHE_MS = 6 * 60 * 60 * 1000;

export const PHILIPPINE_OUTLOOK_PLACES = [
  { id: 'ncr', name: 'Metro Manila', region: 'NCR', location: [14.5995, 120.9842] },
  { id: 'car', name: 'Baguio City', region: 'CAR', location: [16.4023, 120.596] },
  { id: 'region-i', name: 'San Fernando', region: 'Ilocos Region', location: [16.6159, 120.3209] },
  { id: 'region-ii', name: 'Tuguegarao', region: 'Cagayan Valley', location: [17.6132, 121.7269] },
  { id: 'region-iii', name: 'San Fernando', region: 'Central Luzon', location: [15.0343, 120.6844] },
  { id: 'region-iv-a', name: 'Calamba', region: 'CALABARZON', location: [14.2117, 121.1653] },
  { id: 'region-iv-b', name: 'Calapan', region: 'MIMAROPA', location: [13.411, 121.18] },
  { id: 'region-v', name: 'Legazpi City', region: 'Bicol Region', location: [13.1391, 123.7438] },
  { id: 'region-vi', name: 'Iloilo City', region: 'Western Visayas', location: [10.7202, 122.5621] },
  { id: 'region-vii', name: 'Cebu City', region: 'Central Visayas', location: [10.3157, 123.8854] },
  { id: 'region-viii', name: 'Tacloban City', region: 'Eastern Visayas', location: [11.244, 125.0032] },
  { id: 'region-ix', name: 'Zamboanga City', region: 'Zamboanga Peninsula', location: [6.9214, 122.079] },
  { id: 'region-x', name: 'Cagayan de Oro', region: 'Northern Mindanao', location: [8.4542, 124.6319] },
  { id: 'region-xi', name: 'Davao City', region: 'Davao Region', location: [7.1907, 125.4553] },
  { id: 'region-xii', name: 'Koronadal City', region: 'SOCCSKSARGEN', location: [6.503, 124.846] },
  { id: 'region-xiii', name: 'Butuan City', region: 'Caraga', location: [8.9475, 125.5406] },
  { id: 'barmm', name: 'Cotabato City', region: 'BARMM', location: [7.2236, 124.2464] },
];

let outlookCache = null;
let outlookRequest = null;
let ensoCache = null;
let ensoRequest = null;

function locationsQuery() {
  return {
    latitude: PHILIPPINE_OUTLOOK_PLACES.map(({ location }) => location[0].toFixed(4)).join(','),
    longitude: PHILIPPINE_OUTLOOK_PLACES.map(({ location }) => location[1].toFixed(4)).join(','),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}

async function mapWithConcurrency(items, maxConcurrent, callback) {
  const results = Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(maxConcurrent, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index]);
    }
  }));
  return results;
}

function responseLocations(data) {
  const locations = Array.isArray(data) ? data : [data];
  if (locations.length !== PHILIPPINE_OUTLOOK_PLACES.length) {
    throw new Error('The rainfall forecast did not return data for every outlook location.');
  }
  return locations;
}

function monthlyNormalRates(archive) {
  const values = archive?.properties?.parameter?.PRECTOTCORR;
  if (!values || typeof values !== 'object') return null;

  const totals = new Map();
  const counts = new Map();
  for (const [yearMonth, rate] of Object.entries(values)) {
    const match = yearMonth.match(/^(\d{4})(\d{2})$/);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < CLIMATE_START || year > CLIMATE_END || month < 1 || month > 12) continue;
    if (!Number.isFinite(rate) || rate < 0) continue;
    totals.set(month, (totals.get(month) ?? 0) + rate);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  const rates = new Map();
  for (let month = 1; month <= 12; month += 1) {
    const count = counts.get(month) ?? 0;
    if (count < 15) continue;
    rates.set(month, (totals.get(month) ?? 0) / count);
  }
  return rates.size === 12 ? rates : null;
}

export function summarizeDroughtPlace(place, forecast, archive) {
  const dates = forecast.daily?.time ?? [];
  const precipitation = forecast.daily?.precipitation_sum ?? [];
  const monthlyRates = monthlyNormalRates(archive);
  if (dates.length !== OUTLOOK_DAYS || precipitation.length !== dates.length || !monthlyRates) return null;
  if (precipitation.some((value) => !Number.isFinite(value) || value < 0)) return null;

  const forecastDaysByMonth = new Map();
  for (const date of dates) {
    const month = Number(date.slice(5, 7));
    if (month < 1 || month > 12) return null;
    forecastDaysByMonth.set(month, (forecastDaysByMonth.get(month) ?? 0) + 1);
  }

  let normalMm = 0;
  for (const [month, days] of forecastDaysByMonth) {
    normalMm += (monthlyRates.get(month) ?? 0) * days;
  }
  if (!Number.isFinite(normalMm) || normalMm < 1) return null;

  const forecastMm = precipitation.reduce((sum, value) => sum + value, 0);
  const rainfallPercent = Math.round((forecastMm / normalMm) * 100);
  const status = rainfallPercent < 50
    ? 'Very low rainfall outlook'
    : rainfallPercent < 75
      ? 'Below-normal rain signal'
      : rainfallPercent < 100
        ? 'Near-normal rain outlook'
        : 'Normal or wetter outlook';

  return {
    ...place,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    forecastMm: Math.round(forecastMm),
    normalMm: Math.round(normalMm),
    rainfallPercent,
    status,
    updatedAt: new Date().toISOString(),
  };
}

function forecastUrl() {
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.search = new URLSearchParams({
    ...locationsQuery(),
    daily: 'precipitation_sum',
    forecast_days: String(OUTLOOK_DAYS),
    timezone: 'Asia/Manila',
  });
  return url;
}

async function fetchNasaMonthlyNormal({ location }) {
  const url = new URL(NASA_POWER_MONTHLY_URL);
  url.search = new URLSearchParams({
    parameters: 'PRECTOTCORR',
    community: 'AG',
    longitude: location[1].toFixed(4),
    latitude: location[0].toFixed(4),
    start: String(CLIMATE_START),
    end: String(CLIMATE_END),
    format: 'JSON',
  });
  return fetchJson(url);
}

export function fetchDroughtOutlook(forceRefresh = false) {
  if (!forceRefresh && outlookCache && Date.now() - outlookCache.cachedAt < CACHE_MS) {
    return Promise.resolve(outlookCache.value);
  }
  if (!forceRefresh && outlookRequest) return outlookRequest;

  outlookRequest = Promise.all([
    fetchJson(forecastUrl()),
    mapWithConcurrency(PHILIPPINE_OUTLOOK_PLACES, 4, fetchNasaMonthlyNormal),
  ])
    .then(([forecastData, climateData]) => {
      const forecasts = responseLocations(forecastData);
      if (climateData.length !== PHILIPPINE_OUTLOOK_PLACES.length) {
        throw new Error('NASA POWER did not return climate normals for every outlook location.');
      }
      const results = PHILIPPINE_OUTLOOK_PLACES
        .map((place, index) => summarizeDroughtPlace(place, forecasts[index], climateData[index]))
        .filter(Boolean)
        .sort((a, b) => a.rainfallPercent - b.rainfallPercent);
      if (results.length < 10) {
        throw new Error('Too few complete regional outlooks were returned to show reliably.');
      }
      outlookCache = { value: results, cachedAt: Date.now() };
      return results;
    })
    .finally(() => { outlookRequest = null; });

  return outlookRequest;
}

export function fetchEnsoIndicator(forceRefresh = false) {
  if (!forceRefresh && ensoCache && Date.now() - ensoCache.cachedAt < CACHE_MS) {
    return Promise.resolve(ensoCache.value);
  }
  if (!forceRefresh && ensoRequest) return ensoRequest;

  ensoRequest = fetch('/api/enso', { signal: AbortSignal.timeout(15_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`NOAA ENSO service returned ${response.status}`);
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) return response.json();
      return parseNoaaOniText(await response.text());
    })
    .then((data) => {
      if (!data.latest || !Array.isArray(data.recent)) {
        throw new Error('The NOAA ENSO indicator returned incomplete data.');
      }
      ensoCache = { value: data, cachedAt: Date.now() };
      return data;
    })
    .finally(() => { ensoRequest = null; });
  return ensoRequest;
}

function parseNoaaOniText(text) {
  const rows = [];
  const pattern = /^\s*([A-Z]{3})\s+(\d{4})\s+[-\d.]+\s+(-?\d+(?:\.\d+)?)/gm;
  let match = pattern.exec(text);
  while (match) {
    rows.push({ season: match[1], year: Number(match[2]), oni: Number(match[3]) });
    match = pattern.exec(text);
  }
  const recent = rows.slice(-6);
  if (recent.length < 5) throw new Error('NOAA ONI feed contained too few readings.');
  const latest = recent[recent.length - 1];
  const lastFive = recent.slice(-5);
  const phase = lastFive.every(({ oni }) => oni >= 0.5)
    ? 'El Niño-range ONI for 5 overlapping seasons'
    : lastFive.every(({ oni }) => oni <= -0.5)
      ? 'La Niña-range ONI for 5 overlapping seasons'
      : latest.oni >= 0.5
        ? 'El Niño-range ONI; persistence not yet met'
        : latest.oni <= -0.5
          ? 'La Niña-range ONI; persistence not yet met'
          : latest.oni >= 0.2
            ? 'Warm ENSO signal'
            : latest.oni <= -0.2
              ? 'Cool ENSO signal'
              : 'Near-neutral ENSO signal';
  return { latest, recent, phase, source: 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt' };
}
