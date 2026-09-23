import { fetchFirmsRowsForBbox } from './haze.js';

const SURIGAO_BOUNDS = [125.35, 9.65, 125.65, 9.9];
const PHILIPPINES_BOUNDS = [116, 4.5, 127.5, 21.5];
const ESRI_FIRE_URL =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/' +
  'Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
const HOTSPOT_WINDOW_H = 24;
const THERMAL_CACHE_MS = 60 * 1000;
let cache = null;
let request = null;
let nationalCache = null;
let nationalRequest = null;

function consolidateHotspots(hotspots) {
  const bestByCell = new Map();
  for (const hotspot of hotspots) {
    const confidence = String(hotspot.confidence ?? '').trim().toLowerCase();
    if (confidence === 'l' || confidence === 'low') continue;
    const key = `${Math.round(hotspot.lat * 100)}_${Math.round(hotspot.lon * 100)}`;
    const previous = bestByCell.get(key);
    if (!previous || hotspot.frp > previous.frp) bestByCell.set(key, hotspot);
  }
  return [...bestByCell.values()];
}

/**
 * VIIRS thermal detections are evidence, not located reports. A hotspot can
 * support a nearby human report, but it must never create a fire pin alone.
 */
export async function fetchThermalHotspots({ national = false } = {}) {
  const activeCache = national ? nationalCache : cache;
  const activeRequest = national ? nationalRequest : request;
  if (activeCache && Date.now() - activeCache.fetchedAt < THERMAL_CACHE_MS) return activeCache.value;
  if (activeRequest) return activeRequest;
  const [west, south, east, north] = national ? PHILIPPINES_BOUNDS : SURIGAO_BOUNDS;
  const query = new URLSearchParams({
    where: `hours_old <= ${HOTSPOT_WINDOW_H}`,
    geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'frp,confidence,hours_old,acq_time',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: national ? '2000' : '200',
    f: 'json',
  });

  const firmsRows = national
    ? fetchFirmsRowsForBbox(PHILIPPINES_BOUNDS)
      .then((rows) => rows.map((row) => ({
        lat: row.lat,
        lon: row.lon,
        frp: row.frp,
        confidence: row.confidence,
        sensor: row.sensor,
        hoursOld: row.at == null ? 24 : Math.max(0, (Date.now() - row.at) / 3600e3),
        acqTime: row.at,
      })))
      .catch(() => null)
    : Promise.resolve(null);

  const nextRequest = firmsRows
    .then((firmsValue) => firmsValue || fetch(`${ESRI_FIRE_URL}?${query}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Thermal service returned ${response.status}`);
        return response.json();
      }))
    .then((body) => {
        let value = body;
        if (!Array.isArray(body)) {
          if (body.error) throw new Error(body.error.message || 'Thermal service error');
          value = (body.features || []).flatMap((feature) => {
            const lat = feature.geometry?.y;
            const lon = feature.geometry?.x;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
            return [{
              lat,
              lon,
              frp: Number(feature.attributes?.frp) || 0,
              confidence: feature.attributes?.confidence,
              sensor: 'Esri VIIRS mirror',
              hoursOld: Number(feature.attributes?.hours_old) || 0,
              acqTime: feature.attributes?.acq_time,
            }];
          });
        }
      const consolidated = consolidateHotspots(value);
      if (national) nationalCache = { value: consolidated, fetchedAt: Date.now() };
      else cache = { value: consolidated, fetchedAt: Date.now() };
      return consolidated;
    })
    .catch(() => activeCache?.value ?? [])
    .finally(() => {
      if (national) nationalRequest = null;
      else request = null;
    });
  if (national) nationalRequest = nextRequest;
  else request = nextRequest;
  return nextRequest;
}

