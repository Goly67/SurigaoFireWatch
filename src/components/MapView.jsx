import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer, TileLayer, WMSTileLayer, Marker, Polygon, Polyline, Circle, CircleMarker, Pane, Tooltip, Popup, ZoomControl, useMap, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { SURIGAO_CENTER } from '../data/surigao.js';
import { bfpStations } from '../data/bfpStations.js';
import { destination } from '../lib/geo.js';
import { projectSpread } from '../lib/fireSpread.js';
import { HazeLayer } from './HazeUI.jsx';

// Frame that takes in Indonesia's fire belt and the whole Philippines.
const HAZE_BOUNDS = [[-9.5, 96], [21.5, 144]];
const MOBILE_HAZE_BOUNDS = [[-8.5, 108], [20.5, 132]];
const PHILIPPINES_BOUNDS = [[4.5, 116], [21.5, 127.5]];
const EL_NINO_WMS_PARAMS = {
  layers: 'CRW_sst_anom_v1_0:sea_surface_temperature_anomaly',
  format: 'image/png',
  transparent: true,
  version: '1.3.0',
};

/** Glyphs drawn inline so they can be tinted and animated with CSS. */
const flameSvg = `
<svg viewBox="0 0 24 28" aria-hidden="true" class="fx-flame">
  <path class="fx-flame-outer" d="M12 1c.6 4.6-4.8 6.8-4.8 12.4A6.6 6.6 0 0 0 12 20.2a6.6 6.6 0 0 0 4.8-6.8c0-2.2-.9-3.9-1.9-5.4-.3 1.7-1.3 2.7-2.6 2.9C13 8.5 13.2 4.6 12 1z"/>
  <path class="fx-flame-inner" d="M12 13.2c.2 2-1.9 2.8-1.9 4.6a1.9 1.9 0 0 0 3.8 0c0-1.7-1.5-2.5-1.9-4.6z"/>
</svg>`;

const smokeSvg = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path class="fx-cloud" d="M7.5 18a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.6 9.6 4.2 4.2 0 0 1 17 18z"/>
</svg>`;

const controlledSvg = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path class="fx-shield" d="M12 2.5 4.5 5.4v5.6c0 4.6 3.1 8.1 7.5 10 4.4-1.9 7.5-5.4 7.5-10V5.4z"/>
  <path class="fx-check" d="m8.6 12.2 2.6 2.6 4.4-5"/>
</svg>`;

function incidentIcon(incident, isSelected, incidentState = 'active') {
  const held = incident.alarm.level === 0;
  const underControl = incidentState === 'under_control';
  const lightWarning = held && !underControl;
  const alarmColor = underControl ? '#2F6CFF' : incident.alarm.color;
  const badgeCode = underControl ? 'UC' : incident.alarm.code;
  const glyph = underControl ? controlledSvg : lightWarning ? smokeSvg : flameSvg;

  return L.divIcon({
    className: 'pin-wrap',
    html: `
      <span class="fx-pin ${lightWarning ? 'is-light' : ''} ${underControl ? 'is-under-control' : ''} ${isSelected ? 'is-selected' : ''}"
            style="--alarm:${alarmColor}">
        <span class="fx-pulse"></span>
        <span class="fx-pulse d2"></span>
        <span class="fx-body"><span class="fx-icon">${glyph}</span></span>
        <span class="fx-code">${badgeCode}</span>
      </span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** Embers and smoke streaming downwind, rotated to the spread heading. */
function plumeIcon(bearing, intensity) {
  const embers = Array.from({ length: 7 })
    .map((_, i) => `<span class="ember" style="--i:${i}"></span>`)
    .join('');
  const smoke = Array.from({ length: 4 })
    .map((_, i) => `<span class="smoke" style="--i:${i}"></span>`)
    .join('');
  return L.divIcon({
    className: 'pin-wrap plume-wrap',
    html: `<span class="plume" style="--head:${bearing}deg; --intensity:${intensity}">${smoke}${embers}</span>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function stationIcon(station) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `
      <span class="fx-bfp is-${station.kind}">
        <svg viewBox="0 0 28 31" aria-hidden="true">
          <path class="fx-bfp-shield" d="M14 1.5 3 5.4v8.2c0 6.3 4.4 11.1 11 14.9 6.6-3.8 11-8.6 11-14.9V5.4z"/>
          <path class="fx-bfp-drop" d="M14 7c.4 3.1-3.3 4.6-3.3 8.4a3.3 3.3 0 0 0 6.6 0c0-1.5-.6-2.7-1.3-3.7-.2 1.1-.9 1.8-1.8 2 .6-2.2.5-4.7-.2-6.7z"/>
        </svg>
        <span class="fx-bfp-text">BFP</span>
      </span>`,
    iconSize: [34, 40],
    iconAnchor: [17, 20],
  });
}

// bfpStations never changes at runtime, so its icons are built once here
// instead of on every MapView render (which, with the haze layer playing,
// used to happen roughly twice a second and was the actual source of lag —
// every station badge was torn down and rebuilt each tick even though
// nothing about the stations had changed).
const STATION_MARKERS = bfpStations.map((station) => ({ station, icon: stationIcon(station) }));

function FlyTo({ location, railOpen }) {
  const map = useMap();
  useEffect(() => {
    if (!location) return undefined;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const targetY = mobile && railOpen ? map.getSize().y * 0.28 : null;
    const moveSelectedFire = () => {
      if (targetY == null) return;
      const zoom = map.getZoom();
      const size = map.getSize();
      const projected = map.project(location, zoom);
      const desiredCenter = projected.add([0, size.y / 2 - targetY]);
      map.setView(map.unproject(desiredCenter, zoom), zoom, { animate: true, duration: 0.28 });
    };
    map.once('moveend', moveSelectedFire);
    map.flyTo(location, Math.max(map.getZoom(), mobile ? 13 : 16), { duration: 0.8 });
    return () => map.off('moveend', moveSelectedFire);
  }, [location, map, railOpen]);
  return null;
}

/**
 * "Center on me" button, built as a real Leaflet control so it stacks under
 * the zoom buttons and never swallows clicks meant for the map. It only
 * appears once the device has shared a location.
 */
function LocateControl({ location }) {
  const map = useMap();
  const locationRef = useRef(location);
  locationRef.current = location;
  const available = Boolean(location);

  useEffect(() => {
    if (!available) return undefined;
    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
      const bar = L.DomUtil.create('div', 'leaflet-bar fx-locate');
      const button = L.DomUtil.create('a', '', bar);
      button.href = '#';
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', 'Center map on my location');
      button.title = 'My location';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="7.5"/></svg>';
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(button, 'click', (event) => {
        L.DomEvent.preventDefault(event);
        if (!locationRef.current) return;
        map.flyTo(locationRef.current, Math.max(map.getZoom(), 15), { duration: 0.7 });
      });
      return bar;
    };
    control.addTo(map);
    return () => { control.remove(); };
  }, [map, available]);

  return null;
}

function ClickToPlace({ active, onPick }) {
  useMapEvents({
    click(event) {
      if (active) onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

// The pulse is a CSS animation on a divIcon. The old version re-rendered a
// CircleMarker on every animation frame, which kept React busy for as long
// as location sharing was on.
const USER_ICON = L.divIcon({
  className: 'pin-wrap',
  html: '<span class="fx-me"><span class="fx-me-ring"></span><span class="fx-me-dot"></span></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

function UserLocationPulse({ center }) {
  return <Marker position={center} icon={USER_ICON} interactive={false} keyboard={false} />;
}

function UserLocationMarker({ location, accuracy }) {
  const [isMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);

  if (!location) return null;
  return (
    <>
      {accuracy != null && (
        <Circle
          center={location}
          radius={isMobile ? 200 : accuracy}
          pathOptions={{ color: '#1677D2', weight: 1, fillColor: '#1677D2', fillOpacity: 0.08 }}
        />
      )}
      <UserLocationPulse center={location} />
    </>
  );
}

/**
 * The haze view is regional (Indonesia to the Philippines), the fire view is
 * street level. Without this the map stays zoomed on Surigao when you switch
 * tabs and every hotspot is hundreds of kilometres off screen.
 */
function HazeViewport({ active }) {
  const map = useMap();
  const previous = useRef(active);
  useEffect(() => {
    if (previous.current === active) return; // first paint, or a StrictMode re-run
    previous.current = active;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (active) {
      map.flyToBounds(mobile ? MOBILE_HAZE_BOUNDS : HAZE_BOUNDS, {
        padding: mobile ? [28, 28] : [24, 24],
        paddingBottomRight: mobile ? [0, Math.round(window.innerHeight * 0.5)] : undefined,
        duration: 0.9,
      });
    } else {
      map.flyTo(SURIGAO_CENTER, mobile ? 13 : 14, { duration: 0.9 });
    }
  }, [active, map]);
  return null;
}

function ElNinoViewport({ active }) {
  const map = useMap();
  const previous = useRef(null);
  useEffect(() => {
    if (previous.current === active) return undefined;
    previous.current = active;
    if (!active) {
      // OSM's square Web Mercator world must remain at least as large as the
      // viewport in both dimensions. Below this limit, tiles repeat sideways
      // and the uncovered polar edges show the map background as white bands.
      const normalWorldBounds = L.latLngBounds([[-85.0511, -180], [85.0511, 180]]);
      const fitNormalWorld = () => {
        const size = map.getSize();
        if (!size.x || !size.y) return;
        const minZoom = Math.max(0, Math.log2(Math.max(size.x, size.y) / 256));
        map.setMinZoom(minZoom);
        if (map.getZoom() < minZoom) map.setZoom(minZoom, { animate: false });
      };
      map.setMaxBounds(normalWorldBounds);
      map.options.maxBoundsViscosity = 1;
      map.setMaxZoom(19);
      fitNormalWorld();
      map.setView(SURIGAO_CENTER, window.matchMedia('(max-width: 900px)').matches ? 13 : 14, { animate: false });
      // The local fire map should open at its usual zoom, while retaining the
      // world-fit minimum for zooming out.
      map.on('resize', fitNormalWorld);
      return () => map.off('resize', fitNormalWorld);
    }

    // Keep one unwrapped world so the tiles do not repeat, and focus on the
    // Philippines when the El Niño layer is enabled.
    const worldBounds = L.latLngBounds([[-60, 90], [75, 450]]);
    let firstFit = true;
    const fitOneWorld = () => {
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const minZoom = Math.max(0, Math.log2(Math.max(size.x, size.y) / 256));
      map.setMaxBounds(worldBounds);
      map.options.maxBoundsViscosity = 1;
      map.setMinZoom(minZoom);
      map.setMaxZoom(12);
      if (firstFit) {
        map.flyToBounds(PHILIPPINES_BOUNDS, {
          padding: [36, 36],
          maxZoom: 6,
          duration: 0.8,
        });
      }
      else if (map.getZoom() < minZoom) map.setZoom(minZoom, { animate: false });
      firstFit = false;
    };
    fitOneWorld();
    map.on('resize', fitOneWorld);
    return () => map.off('resize', fitOneWorld);
  }, [active, map]);
  return null;
}

function ElNinoLayer({ onStatusChange }) {
  useEffect(() => {
    onStatusChange('loading');
  }, [onStatusChange]);

  return (
    <WMSTileLayer
      className="sst-anomaly-tiles"
      url="https://oceanwatch.pifsc.noaa.gov/erddap/wms/CRW_sst_anom_v1_0/request"
      params={EL_NINO_WMS_PARAMS}
      opacity={0.86}
      zIndex={350}
      maxZoom={12}
      eventHandlers={{
        loading: () => onStatusChange('loading'),
        tileload: () => onStatusChange('ready'),
        tileerror: () => onStatusChange('error'),
      }}
      attribution='SST anomaly: <a href="https://coralreefwatch.noaa.gov/product/5km/index_5km_ssta.php" target="_blank" rel="noreferrer">NOAA Coral Reef Watch · daily 5 km satellite anomaly</a>'
    />
  );
}

function riskColor(score) {
  if (score >= 70) return '#C62828';
  if (score >= 45) return '#EF6C00';
  return '#D1A900';
}

function weatherRiskIcon(spot) {
  const color = riskColor(spot.score);
  return L.divIcon({
    className: 'pin-wrap weather-risk-marker-wrap',
    html: `<span class="weather-risk-marker" style="--risk-color:${color}" aria-hidden="true">
      <span class="weather-risk-marker-halo"></span>
      <span class="weather-risk-marker-core">
        <svg class="weather-risk-thermometer" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14 14.76V5a4 4 0 0 0-8 0v9.76a6 6 0 1 0 8 0Z" />
          <path d="M10 7v10" />
          <circle cx="10" cy="18" r="2.5" />
        </svg>
      </span>
      <span class="weather-risk-marker-score">${spot.score}</span>
    </span>`,
    iconSize: [48, 54],
    iconAnchor: [24, 27],
  });
}

function WeatherPopupClose() {
  const map = useMap();
  return (
    <button
      type="button"
      className="weather-risk-close"
      aria-label="Close weather screening details"
      onClick={(event) => {
        event.preventDefault();
        L.DomEvent.stopPropagation(event);
        map.closePopup();
      }}
    >
      ×
    </button>
  );
}

function SurigaoWeatherLayer({ spots = [] }) {
  return spots.map((spot) => (
    <Marker
      key={spot.id}
      position={spot.location}
      icon={weatherRiskIcon(spot)}
      title={`Surigao City Gym weather screening: ${spot.score} out of 100`}
      zIndexOffset={1500}
    >
      <Popup className="weather-risk-leaflet-popup" closeButton={false}>
        <div className="weather-risk-popup">
          <header className="weather-risk-popup-head">
            <div><span>LIVE WEATHER · SURIGAO CITY</span><strong>Fire-weather screening</strong></div>
            <b className="weather-risk-score">{spot.score}<small>/100</small></b>
            <WeatherPopupClose />
          </header>
          <div className="weather-risk-metrics">
            <div><strong>{spot.temperature == null ? '—' : `${spot.temperature.toFixed(1)}°C`}</strong><span>Air temperature</span></div>
            <div><strong>{spot.humidity == null ? '—' : `${Math.round(spot.humidity)}%`}</strong><span>Humidity</span></div>
            <div><strong>{spot.tempRiseC == null ? '—' : `${spot.tempRiseC >= 0 ? '+' : ''}${spot.tempRiseC.toFixed(1)}°C`}</strong><span>Change vs 72 h mean</span></div>
            <div><strong>{spot.recentRain == null ? '—' : `${spot.recentRain.toFixed(1)} mm`}</strong><span>Rain in recent 72 h</span></div>
          </div>
          <p className="weather-risk-disclaimer">Surigao City weather screening only. This is not a reported fire or a prediction of an ignition point. The city marker shows the screening area; weather input comes from a coarser model grid.</p>
          <footer>Open-Meteo model grid · {spot.coverage}% input coverage<br />Grid cell {(spot.modelGridLocation ?? spot.location)[0].toFixed(3)}°, {(spot.modelGridLocation ?? spot.location)[1].toFixed(3)}°</footer>
        </div>
      </Popup>
    </Marker>
  ));
}

/** Cool-to-hot gradient for a Philippine temperature range. */
function tempColor(tempC) {
  if (typeof tempC !== 'number' || Number.isNaN(tempC)) return '#9AA3AE';
  if (tempC < 24) return '#2F8FE0';
  if (tempC < 27) return '#2FB0A6';
  if (tempC < 30) return '#E8B400';
  if (tempC < 33) return '#F4700A';
  return '#DC2F2F';
}

function cityTempIcon(city) {
  const hasTemp = typeof city.tempC === 'number' && !Number.isNaN(city.tempC);
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="fx-temp" style="--temp-color:${tempColor(city.tempC)}">${hasTemp ? `${Math.round(city.tempC)}°` : '—'}</span>`,
    iconSize: [46, 24],
    iconAnchor: [23, 12],
  });
}

/**
 * PAGASA AWS readings are public and shown at the reporting station's
 * coordinates. The compact chip keeps dense station clusters readable.
 */
function CityTemperatureLayer({ cities }) {
  return cities.map((city) => {
    const hasTemp = typeof city.tempC === 'number' && !Number.isNaN(city.tempC);
    return (
      <Marker key={city.id} position={city.location} icon={cityTempIcon(city)} zIndexOffset={2500}>
        <Tooltip direction="top" offset={[0, -14]} opacity={1} className="temp-tooltip">
          {city.name}{city.stationName ? ` · ${city.stationName}` : ''}{hasTemp ? ` · ${Math.round(city.tempC)}°C` : ''}
        </Tooltip>
      </Marker>
    );
  });
}

function MobilePanelOffset({ railOpen }) {
  const map = useMap();
  const offsetRef = useRef(false);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    if (!mobile || offsetRef.current === railOpen) return;
    offsetRef.current = railOpen;
    map.panBy([0, railOpen ? Math.round(window.innerHeight * 0.12) : -Math.round(window.innerHeight * 0.12)], {
      animate: true,
      duration: 0.28,
    });
  }, [map, railOpen]);

  return null;
}

/**
 * The side panel collapsing/expanding resizes .stage via a CSS grid-column
 * transition, not a DOM resize event, so Leaflet never hears about it and
 * keeps painting tiles at the old, narrower size — leaving a blank strip
 * where the panel used to be. Nudge it once the layout settles.
 */
function ResizeOnPanelToggle({ trigger }) {
  const map = useMap();
  useEffect(() => {
    const raf = requestAnimationFrame(() => map.invalidateSize({ animate: true }));
    // 280ms is the .app grid-column transition duration in styles.css;
    // this second call catches the final size once it's done animating.
    const afterTransition = setTimeout(() => map.invalidateSize({ animate: true }), 320);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(afterTransition);
    };
  }, [trigger, map]);
  return null;
}

/**
 * Everything about local fires (stations, pins, spread cone, report dots).
 * None of it depends on the haze frame or wind-advection playback, so it's
 * split out and memoized — otherwise every tick of the haze timeline
 * (roughly twice a second while playing) re-ran this whole tree, rebuilding
 * every marker icon from scratch even though nothing here had changed.
 * That icon churn, not the smoke cross-fade, was what read as "laggy".
 */
const LocalLayer = memo(function LocalLayer({
  incidents, incidentStateMap = {}, selectedId, onSelect, showStations, selected, active, live, horizonMinutes, pendingLocation,
}) {
  return (
    <>
      {showStations &&
        STATION_MARKERS.map(({ station, icon }) => (
          <Marker key={station.id} position={station.location} icon={icon}>
            <Tooltip direction="top" offset={[0, -14]}>
              <strong>{station.name}</strong>
              <br />
              {station.city} · {station.region}
              {station.contact && (
                <>
                  <br />
                  {station.contact}
                </>
              )}
            </Tooltip>
          </Marker>
        ))}

      {active && (
        <>
          {/* ghost outlines at the fixed horizons, for reference */}
          {selected.projections.map((p) => (
            <Polygon
              key={p.minutes}
              positions={p.polygon}
              pathOptions={{
                color: selected.alarm.color,
                fill: false,
                weight: 1,
                opacity: 0.35,
                dashArray: '2 7',
                className: 'ghost-ring',
              }}
            />
          ))}

          <Polygon
            positions={live.polygon}
            pathOptions={{
              color: selected.alarm.color,
              fillColor: selected.alarm.color,
              fillOpacity: 0.22,
              weight: 2.5,
              className: 'live-front',
            }}
          >
            <Tooltip sticky>
              {horizonMinutes} min · ~{live.estimatedStructures} structures ·{' '}
              {live.headDistanceM.toFixed(0)} m downwind
            </Tooltip>
          </Polygon>

          <Polyline
            positions={[
              selected.location,
              destination(selected.location, live.headBearing, live.headDistanceM * 1.15),
            ]}
            pathOptions={{
              color: selected.alarm.color,
              weight: 2,
              dashArray: '6 10',
              className: 'wind-vector',
            }}
          />

          <Marker
            position={selected.location}
            icon={plumeIcon(live.headBearing, Math.min(selected.alarm.level / 5, 1))}
            interactive={false}
          />
        </>
      )}

      {selected &&
        selected.reports.map((report) => (
          <CircleMarker
            key={report.id}
            center={report.location}
            radius={5}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: '#F4700A',
              fillOpacity: 1,
              className: 'report-dot',
            }}
          >
            <Tooltip direction="top">{report.note}</Tooltip>
          </CircleMarker>
        ))}

      <Pane name="fireIncidentPane" style={{ zIndex: 690 }}>
        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            pane="fireIncidentPane"
            position={incident.location}
            icon={incidentIcon(incident, incident.id === selectedId, incidentStateMap[incident.id] ?? 'active')}
            title={`Fire report, alarm level ${incident.alarm.level}. Tap for details`}
            eventHandlers={{ click: () => onSelect(incident.id) }}
            // Keep fire symbols above the user-location pane and map pins.
            // Leaflet's screen-y ordering still ranks fires within this pane.
            zIndexOffset={
              (incident.alarm.level > 0 ? 3000 : 1000) +
              (incident.id === selectedId ? 2000 : 0)
            }
          />
        ))}
      </Pane>

      {pendingLocation && (
        <CircleMarker
          center={pendingLocation}
          radius={9}
          pathOptions={{ color: '#F4700A', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top">New report</Tooltip>
        </CircleMarker>
      )}
    </>
  );
});

export default function MapView({
  incidents,
  incidentStateMap = {},
  selectedId,
  onSelect,
  placing,
  pendingLocation,
  onPickLocation,
  horizonMinutes,
  showStations,
  railOpen,
  hazeMode = false,
  haze = null,
  hazeFrame = 0,
  hazeFocus = null,
  userLocation = null,
  userLocationAccuracy = null,
  localWeather = null,
  cityTemps = [],
  historicalOverlay = null,
  elNinoMode = false,
  fireRiskSpots = [],
  onSstTileStatusChange = () => {},
}) {
  const selected = incidents.find((i) => i.id === selectedId);
  const selectedState = selected ? incidentStateMap[selected.id] ?? 'active' : 'active';
  const active = selectedState === 'active' && selected && selected.alarm.level > 0;

  const live = useMemo(
    () => (active ? projectSpread({ ...selected.spreadParams, minutes: horizonMinutes }) : null),
    [active, selected, horizonMinutes]
  );

  return (
    <MapContainer
      center={SURIGAO_CENTER}
      zoom={14}
      className={`map ${placing ? 'is-placing' : ''} ${elNinoMode ? 'is-el-nino-mode' : ''}`}
      zoomControl={false}
    >
      <TileLayer
        className="tile-base"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <ZoomControl position="topright" />
      <LocateControl location={userLocation} />
      <ResizeOnPanelToggle trigger={railOpen} />
      <ClickToPlace active={placing} onPick={onPickLocation} />
      {selected && <FlyTo location={selected.location} railOpen={railOpen} />}
      <HazeViewport active={hazeMode} />
      <ElNinoViewport active={elNinoMode} />
      {elNinoMode && (
        <Pane name="sst-anomaly-pane" style={{ zIndex: 350, pointerEvents: 'none' }}>
          <ElNinoLayer onStatusChange={onSstTileStatusChange} />
        </Pane>
      )}
      <MobilePanelOffset railOpen={railOpen} />
      {hazeMode && (
        <HazeLayer
          data={haze}
          frame={hazeFrame}
          focus={hazeFocus}
        />
      )}

      {historicalOverlay && (
        <>
          <Polygon
            positions={historicalOverlay.spread.polygon}
            pathOptions={{
              color: '#DC6207',
              fillColor: '#DC6207',
              fillOpacity: 0.24,
              weight: 2.5,
              className: 'historical-fire-overlay',
            }}
          >
            <Tooltip sticky>
              Historical fire spread · {historicalOverlay.spread.headDistanceM.toFixed(0)} m downwind
            </Tooltip>
          </Polygon>
          <Polyline
            positions={[historicalOverlay.fire, historicalOverlay.direction]}
            pathOptions={{ color: '#DC6207', weight: 2, dashArray: '6 10' }}
          />
          {(historicalOverlay.hotspots ?? []).map((hotspot, idx) => (
            <CircleMarker
              key={`${hotspot.sensor}-${hotspot.acqDate}-${hotspot.acqTime}-${idx}`}
              center={[hotspot.lat, hotspot.lon]}
              radius={7}
              pathOptions={{ color: '#fff5ef', weight: 2, fillColor: '#ff7a00', fillOpacity: 0.9 }}
            >
              <Tooltip direction="top" sticky>
                {hotspot.sensor.replace('_NRT', '').replace('_', ' ')} · {hotspot.acqDate} {String(hotspot.acqTime || '0000').padStart(4, '0')} UTC · FRP {Number(hotspot.frp || 0).toFixed(1)} MW · confidence {hotspot.confidence}
              </Tooltip>
            </CircleMarker>
          ))}
          <CircleMarker
            center={historicalOverlay.fire}
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#DC6207', fillOpacity: 1 }}
          >
            <Tooltip direction="top">Historical fire ignition</Tooltip>
          </CircleMarker>
        </>
      )}

      {!elNinoMode && (
        <SurigaoWeatherLayer spots={fireRiskSpots} />
      )}
      {!elNinoMode && <CityTemperatureLayer cities={cityTemps} />}
      <LocalLayer
        incidents={incidents}
        incidentStateMap={incidentStateMap}
        selectedId={selectedId}
        onSelect={onSelect}
        showStations={showStations}
        selected={selected}
        active={active}
        live={live}
        horizonMinutes={horizonMinutes}
        pendingLocation={pendingLocation}
      />
      <Pane name="userLocationPane" style={{ zIndex: 675 }}>
        <UserLocationMarker
          location={userLocation}
          accuracy={userLocationAccuracy}
        />
      </Pane>
    </MapContainer>
  );
}
