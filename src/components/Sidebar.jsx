import { useEffect, useMemo, useState } from 'react';
import brandLogo from '../assets/SFW-ICON.png';
import { compassLabel } from '../lib/geo.js';
import { bfpStations, regions, STATION_DATA_NOTE } from '../data/bfpStations.js';
import { ALARM_LEVELS } from '../lib/alarmLevels.js';

const STATUS_COPY = {
  confirmed: 'Confirmed by more than one report — posted automatically',
  unverified: 'Single report — waiting on admin approval to post',
};

const statusCopy = (incident) => {
  const next = ALARM_LEVELS.find((level) => incident.reports.length < level.minReports);
  if (!next) return `${STATUS_COPY[incident.triage.status] ?? 'Active'} · 5th Alarm report threshold reached`;
  const needed = next.minReports - incident.reports.length;
  const progress = `${needed} more report${needed === 1 ? '' : 's'} to ${next.label}`;
  if (incident.triage.status === 'monitoring') return `Light warning — waiting for ${progress}`;
  return `${STATUS_COPY[incident.triage.status]} · ${progress}`;
};

const relative = (minutes) => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  return `${(minutes / 60).toFixed(1)} h ago`;
};

// Deterministic pseudo-random floats from an index, so embers are stable
// across re-renders instead of jittering every time React repaints.
const emberSeed = (i) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const EMBER_COUNT = 14;
const embers = Array.from({ length: EMBER_COUNT }, (_, i) => ({
  left: `${(emberSeed(i) * 100).toFixed(1)}%`,
  delay: `${(emberSeed(i + 50) * 6).toFixed(2)}s`,
  duration: `${(4 + emberSeed(i + 100) * 3.5).toFixed(2)}s`,
  size: `${(2 + emberSeed(i + 150) * 3).toFixed(1)}px`,
  drift: `${(emberSeed(i + 200) * 40 - 20).toFixed(0)}px`,
}));

function EmberField() {
  return (
    <div className="ember-field" aria-hidden="true">
      {embers.map((e, i) => (
        <span
          key={i}
          className="brand-ember"
          style={{
            left: e.left,
            width: e.size,
            height: e.size,
            animationDelay: e.delay,
            animationDuration: e.duration,
            '--drift': e.drift,
          }}
        />
      ))}
    </div>
  );
}

const SMOKE_COUNT = 4;
const wisps = Array.from({ length: SMOKE_COUNT }, (_, i) => ({
  left: `${(15 + emberSeed(i + 300) * 70).toFixed(1)}%`,
  delay: `${(emberSeed(i + 350) * 7).toFixed(2)}s`,
  duration: `${(7 + emberSeed(i + 400) * 4).toFixed(2)}s`,
  drift: `${(emberSeed(i + 450) * 50 - 25).toFixed(0)}px`,
}));

function SmokeField() {
  return (
    <div className="smoke-field" aria-hidden="true">
      {wisps.map((w, i) => (
        <span
          key={i}
          className="brand-smoke"
          style={{
            left: w.left,
            animationDelay: w.delay,
            animationDuration: w.duration,
            '--drift': w.drift,
          }}
        />
      ))}
    </div>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true" onDragStart={(event) => event.preventDefault()}>
      <img src={brandLogo} alt="" draggable="false" />
    </span>
  );
}

const SORT_MODES = [
  { key: 'severity', label: 'Severity' },
  { key: 'recent', label: 'Newest' },
];

export default function Sidebar({
  incidents, wind, selectedId, showStations, onToggleStations, onSelect, onReport, onOpenLevels,
  airQualityActive = false,
}) {
  const [sortMode, setSortMode] = useState('severity');
  const [query, setQuery] = useState('');
  const [coverageOpen, setCoverageOpen] = useState(true);

  const live = useMemo(() => {
    const filtered = query.trim()
      ? incidents.filter((incident) =>
          incident.barangayName.toLowerCase().includes(query.trim().toLowerCase()))
      : incidents;
    const sorted = [...filtered];
    if (sortMode === 'severity') {
      sorted.sort((a, b) => b.alarm.level - a.alarm.level || a.minutesElapsed - b.minutesElapsed);
    } else {
      sorted.sort((a, b) => a.minutesElapsed - b.minutesElapsed);
    }
    return sorted;
  }, [incidents, query, sortMode]);

  const highestAlarm = incidents.reduce(
    (max, incident) => (incident.alarm.level > max.level ? incident.alarm : max),
    { level: -1 }
  );
  const hasCritical = highestAlarm.level >= 3;

  return (
    <div className={`panel sidebar ${hasCritical ? 'is-critical' : ''}`}>
      <header className="brand">
        <SmokeField />
        <EmberField />
        <h1>
          <BrandMark />
          <span className="brand-title">
            Surigao <em>Fire</em> Watch
          </span>
        </h1>
        <p>
          Crowdsourced reports, and a wind model that says where the
          fire goes next.
        </p>
        <div className="brand-stats">
          <span className={`stat-pill ${incidents.length > 0 ? 'is-live' : ''}`}>
            <span className="stat-dot" />
            {incidents.length} active
          </span>
          {highestAlarm.level >= 1 && (
            <span className="stat-pill stat-pill--alarm" style={{ '--alarm': highestAlarm.color }}>
              Highest: {highestAlarm.label}
            </span>
          )}
        </div>
      </header>

      <div className="wind-card">
        <div className="wind-dial" style={{ '--dir': `${wind.fromDeg + 180}deg` }}>
          <span className="wind-arrow" />
          <span className="wind-sweep" />
        </div>
        <div>
          <p className="wind-speed">{wind.speedKmh.toFixed(0)} km/h</p>
          <p className="muted small">
            Pushing {compassLabel((wind.fromDeg + 180) % 360)} · {wind.humidity}% humidity
          </p>
          <p className="muted small">
            {wind.source === 'open-meteo'
              ? 'Live observation'
              : 'Fallback reading — weather service unreachable'}
          </p>
        </div>
      </div>

      <button className="primary block pulse report-btn" onClick={onReport}>
        <span className="flame-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12.5 1.5c1 3-.5 4.5-1.8 6C9 9.3 8 11 8 13a4 4 0 0 0 8 0c0-1.1-.4-2-.9-2.8-.2 1.6-1 2.3-1.6 2.3-.7 0-1-.6-.7-1.3.6-1.4.6-3-.3-4.5-.6 1-1.3 1.5-2 1.2-.8-.3-1-1.3-.6-2.2.4-1 .8-2.3.6-4.2Z" />
            <path d="M6.8 14.5c0 3.6 2.9 6.5 6.5 6.5s6.2-2.5 6.4-6c.1-1.6-.3-3-.9-4.1.3 2.6-.8 4.3-1.9 5.2a5.3 5.3 0 0 1-3.6 1.4c-2.5 0-4.5-1.8-4.5-4.3 0-.6.1-1.1.3-1.6-1.4 1-2.3 2.3-2.3 2.9Z" opacity=".55" />
          </svg>
        </span>
        Report a fire
      </button>

      {airQualityActive && (
        <p className="air-quality-signal">
          Elevated smoke readings — corroborating nearby reports
        </p>
      )}

      <section className="incident-section">
        <div className="section-head">
          <h3>
            <span className="section-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                <path d="M12.5 1.5c1 3-.5 4.5-1.8 6C9 9.3 8 11 8 13a4 4 0 0 0 8 0c0-1.1-.4-2-.9-2.8-.2 1.6-1 2.3-1.6 2.3-.7 0-1-.6-.7-1.3.6-1.4.6-3-.3-4.5-.6 1-1.3 1.5-2 1.2-.8-.3-1-1.3-.6-2.2.4-1 .8-2.3.6-4.2Z" />
              </svg>
            </span>
            Active ({live.length})
          </h3>
          {incidents.length > 1 && (
            <div className="incident-controls" role="group" aria-label="Sort incidents">
              {SORT_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  className={`chip-toggle ${sortMode === mode.key ? 'is-active' : ''}`}
                  onClick={() => setSortMode(mode.key)}
                  aria-pressed={sortMode === mode.key}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {incidents.length > 3 && (
          <input
            type="search"
            className="incident-search"
            placeholder="Filter by barangay…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filter active incidents by barangay"
          />
        )}

        {live.length === 0 && incidents.length === 0 && (
          <p className="muted small">Nothing burning. The map stays quiet until it is.</p>
        )}
        {live.length === 0 && incidents.length > 0 && (
          <p className="muted small">No barangay matches "{query}".</p>
        )}

        <ul className="incident-list">
          {live.map((incident, index) => (
            <li key={incident.id} style={{ '--step': index }}>
              <button
                className={`incident-row ${incident.alarm.level === 0 ? 'is-held' : ''} ${incident.id === selectedId ? 'is-active' : ''} ${incident.alarm.level >= 3 ? 'is-severe' : ''}`}
                style={{ '--alarm': incident.alarm.color }}
                onClick={() => onSelect(incident.id)}
              >
                <span className="alarm-chip">{incident.alarm.code}</span>
                <span className="incident-meta">
                  <strong>{incident.barangayName}</strong>
                  <span className="muted small">
                    {relative(incident.minutesElapsed)} · spreading {incident.headDirection}
                  </span>
                  <span className="muted small">{statusCopy(incident)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button className="secondary block levels-btn" onClick={onOpenLevels}>
        <span className="icon-warning-levels" aria-hidden="true">!</span>
        How the 5 levels work
      </button>

      <section className="coverage">
        <div className="coverage-head">
          <button
            type="button"
            className="coverage-title"
            onClick={() => setCoverageOpen((open) => !open)}
            aria-expanded={coverageOpen}
          >
            <span className={`chevron ${coverageOpen ? 'is-open' : ''}`} aria-hidden="true" />
            <h3>
              <span className="section-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                  <path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Zm0 2.2 6 2.2v4.6c0 3.9-2.6 6.9-6 8.8-3.4-1.9-6-4.9-6-8.8V6.4l6-2.2Z" />
                </svg>
              </span>
              BFP coverage
            </h3>
          </button>
          <label className="toggle">
            <input type="checkbox" checked={showStations} onChange={onToggleStations} />
            <span className="toggle-track"><span className="toggle-knob" /></span>
            <span className="small">Show on map</span>
          </label>
        </div>
        <div className={`coverage-body ${coverageOpen ? 'is-open' : ''}`}>
          <p className="muted small">
            {bfpStations.length} stations and offices across {regions.length} Mindanao
            regions: Caraga, Northern Mindanao, Davao, SOCCSKSARGEN, Zamboanga
            Peninsula and BARMM.
          </p>
          <p className="muted small coverage-detail">{STATION_DATA_NOTE}</p>
        </div>
      </section>

      <footer className="disclaimer">
        Barangay boundaries and detector scores in this build are demonstration data.
        Station records are real. Neither replaces calling the Bureau of Fire
        Protection.
      </footer>
    </div>
  );
}