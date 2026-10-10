import { useEffect, useState } from 'react';
import { fetchDroughtOutlook, fetchEnsoIndicator } from '../lib/droughtOutlook.js';

export function useDroughtWatch(enabled) {
  const [state, setState] = useState({
    outlook: null,
    enso: null,
    forecastStatus: 'idle',
    ensoStatus: 'idle',
    forecastError: '',
    ensoError: '',
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((current) => ({
      ...current,
      forecastStatus: current.outlook ? 'refreshing' : 'loading',
      ensoStatus: current.enso ? 'refreshing' : 'loading',
      forecastError: '',
      ensoError: '',
    }));

    fetchDroughtOutlook(refreshKey > 0).then(
      (outlook) => {
        if (!cancelled) setState((current) => ({ ...current, outlook, forecastStatus: 'ready' }));
      },
      (error) => {
        if (!cancelled) setState((current) => ({
          ...current,
          forecastStatus: 'error',
          forecastError: error instanceof Error ? error.message : 'Rainfall outlook is unavailable.',
        }));
      }
    );
    fetchEnsoIndicator(refreshKey > 0).then(
      (enso) => {
        if (!cancelled) setState((current) => ({ ...current, enso, ensoStatus: 'ready' }));
      },
      (error) => {
        if (!cancelled) setState((current) => ({
          ...current,
          ensoStatus: 'error',
          ensoError: error instanceof Error ? error.message : 'NOAA ENSO data is unavailable.',
        }));
      }
    );
    return () => { cancelled = true; };
  }, [enabled, refreshKey]);

  return { ...state, reload: () => setRefreshKey((key) => key + 1) };
}

const formatDate = (value) => new Date(`${value}T12:00:00+08:00`).toLocaleDateString('en-PH', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Manila',
});

function rainfallClass(rainfallPercent) {
  if (rainfallPercent < 50) return 'is-high';
  if (rainfallPercent < 75) return 'is-watch';
  if (rainfallPercent < 100) return 'is-near';
  return 'is-wet';
}

export default function DroughtWatchPanel({ watch, onFocus }) {
  const { outlook, enso, forecastStatus, ensoStatus, forecastError, ensoError, reload } = watch;
  const loading = ['loading', 'idle', 'refreshing'].includes(forecastStatus);

  return (
    <section className="panel sidebar drought-watch-panel">
      <header className="brand">
        <h1>El Niño &amp; dryness watch</h1>
        <p>Observed ENSO conditions and a 16-day rainfall outlook for representative locations across the Philippines.</p>
      </header>

      <section className="enso-status-card" aria-label="Observed El Niño conditions">
        <span className="drought-eyebrow">NOAA OCEANIC NIÑO INDEX</span>
        {enso ? (
          <>
            <strong className="enso-phase">{enso.phase}</strong>
            <span className="enso-reading">
              {enso.latest.season} {enso.latest.year}: {enso.latest.oni > 0 ? '+' : ''}{enso.latest.oni.toFixed(1)}°C
            </span>
            <p>Observed tropical Pacific sea-surface temperature anomaly. ONI is an indicator, not an official El Niño advisory.</p>
          </>
        ) : (
          <p role={ensoStatus === 'error' ? 'alert' : 'status'}>
            {ensoStatus === 'error' ? ensoError : 'Loading NOAA ENSO observations…'}
          </p>
        )}
        {ensoError && enso && <p className="drought-inline-error" role="status">Latest NOAA update failed: {ensoError}</p>}
        <a href="https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt" target="_blank" rel="noreferrer">
          NOAA CPC source
        </a>
      </section>

      <section className="drought-outlook-section">
        <div className="drought-section-heading">
          <div>
            <span className="drought-eyebrow">NEXT 16 DAYS</span>
            <h2>Where rainfall may run low</h2>
          </div>
          <button type="button" className="secondary drought-refresh" onClick={reload} disabled={loading} aria-label="Refresh ENSO and rainfall outlook">
            Refresh
          </button>
        </div>
        <p className="drought-method">
          Forecast rain as a percentage of the 1991–2020 NASA monthly normal. Under 75% is flagged as a drier-than-usual signal.
        </p>
        {forecastError && (
          <p className="drought-error" role="alert">
            {outlook ? `Could not refresh the outlook: ${forecastError}` : forecastError}
          </p>
        )}
        {!outlook && loading && <p className="drought-loading" role="status">Loading rainfall forecasts and climate-normal data…</p>}
        {outlook && (
          <>
            <ul className="drought-place-list">
              {outlook.map((place) => (
                <li key={place.id}>
                  <button type="button" className="drought-place" onClick={() => onFocus(place.location)}>
                    <span className={`drought-dot ${rainfallClass(place.rainfallPercent)}`} aria-hidden="true" />
                    <span className="drought-place-copy">
                      <strong>{place.name}</strong>
                      <small>{place.region} · {place.status}</small>
                    </span>
                    <b className="drought-rainfall-percent">{place.rainfallPercent}%<small> normal</small></b>
                  </button>
                </li>
              ))}
            </ul>
            <p className="drought-period">
              Forecast window: {formatDate(outlook[0].startDate)}–{formatDate(outlook[0].endDate)} · updated {new Date(outlook[0].updatedAt).toLocaleString('en-PH')}
            </p>
          </>
        )}
      </section>

      <div className="drought-legend" aria-label="Rainfall outlook key">
        <span><i className="is-high" />Under 50% very low</span>
        <span><i className="is-watch" />50–74% below normal</span>
        <span><i className="is-near" />75–99% near normal</span>
        <span><i className="is-wet" />100%+ normal or wetter</span>
      </div>
      <p className="drought-coverage-note">
        Map dots mark forecast city centers; they are not administrative boundaries or precise drought areas.
      </p>
      <p className="drought-disclaimer">
        Regional-center model guidance only—not a barangay forecast, drought declaration, or guarantee. Forecast and historical data use different models; local rain and official PAGASA advisories may differ.
        {' '}<a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo forecast</a>
        {' '}· <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER MERRA-2 climate normals</a>
        {' '}· <a href="https://gibs.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA GIBS GHRSST MUR anomaly map</a>
        {' '}· Open-Meteo’s free tier is for non-commercial use.
      </p>
    </section>
  );
}
