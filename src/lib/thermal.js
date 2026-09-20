const SURIGAO_BOUNDS = [125.35, 9.65, 125.65, 9.9];
const ESRI_FIRE_URL =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/' +
  'Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
const HOTSPOT_WINDOW_H = 24;
const THERMAL_CACHE_MS = 15 * 60 * 1000;
let cache = null;
let request = null;

/**
 * VIIRS thermal detections are evidence, not located reports. A hotspot can
 * support a nearby human report, but it must never create a fire pin alone.
 */
export async function fetchThermalHotspots() {
  if (cache && Date.now() - cache.fetchedAt < THERMAL_CACHE_MS) return cache.value;
  if (request) return request;
  const [west, south, east, north] = SURIGAO_BOUNDS;
  const query = new URLSearchParams({
    where: `hours_old <= ${HOTSPOT_WINDOW_H}`,
    geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'frp,confidence,hours_old,acq_time',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });

  request = fetch(`${ESRI_FIRE_URL}?${query}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Thermal service returned ${response.status}`);
      return response.json();
    })
    .then((body) => {
      if (body.error) throw new Error(body.error.message || 'Thermal service error');
      const value = (body.features || []).flatMap((feature) => {
        const lat = feature.geometry?.y;
        const lon = feature.geometry?.x;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        return [{ lat, lon, frp: Number(feature.attributes?.frp) || 0 }];
      });
      cache = { value, fetchedAt: Date.now() };
      return value;
    })
    .catch(() => cache?.value ?? [])
    .finally(() => { request = null; });
  return request;
}
