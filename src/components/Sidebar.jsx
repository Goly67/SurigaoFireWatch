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

export default function Sidebar({
  incidents, wind, selectedId, showStations, onToggleStations, onSelect, onReport, onOpenLevels,
  airQualityActive = false,
}) {
  const live = incidents;

  return (
    <div className="panel sidebar">
      <header className="brand">
        <h1>Surigao Fire Watch</h1>
        <p>
          Crowdsourced reports, aerial sweeps, and a wind model that says where the
          fire goes next.
        </p>
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

      <button className="primary block pulse" onClick={onReport}>Report a fire</button>

      {airQualityActive && (
        <p className="air-quality-signal">
          Elevated smoke readings — corroborating nearby reports
        </p>
      )}

      <section>
        <h3>Active ({live.length})</h3>
        {live.length === 0 && (
          <p className="muted small">Nothing burning. The map stays quiet until it is.</p>
        )}
        <ul className="incident-list">
          {live.map((incident, index) => (
            <li key={incident.id} style={{ '--step': index }}>
              <button
                className={`incident-row ${incident.alarm.level === 0 ? 'is-held' : ''} ${incident.id === selectedId ? 'is-active' : ''}`}
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

      <button className="secondary block" onClick={onOpenLevels}>
        How the 5 levels work
      </button>

      <section className="coverage">
        <div className="coverage-head">
          <h3>BFP coverage</h3>
          <label className="toggle">
            <input type="checkbox" checked={showStations} onChange={onToggleStations} />
            <span className="toggle-track"><span className="toggle-knob" /></span>
            <span className="small">Show on map</span>
          </label>
        </div>
        <p className="muted small">
          {bfpStations.length} stations and offices across {regions.length} Mindanao
          regions: Caraga, Northern Mindanao, Davao, SOCCSKSARGEN, Zamboanga
          Peninsula and BARMM.
        </p>
        <p className="muted small coverage-detail">{STATION_DATA_NOTE}</p>
      </section>

      <footer className="disclaimer">
        Barangay boundaries and detector scores in this build are demonstration data.
        Station records are real. Neither replaces calling the Bureau of Fire
        Protection.
      </footer>
    </div>
  );
}

