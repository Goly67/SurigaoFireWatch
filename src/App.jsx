import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView.jsx';
import Sidebar from './components/Sidebar.jsx';
import ReportForm from './components/ReportForm.jsx';
import IncidentPanel from './components/IncidentPanel.jsx';
import WarningSystem from './components/WarningSystem.jsx';
import Timeline from './components/Timeline.jsx';
import NotificationCenter from './components/NotificationCenter.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import { HazePanel, HazeTimeline, HazeToggle, useHaze } from './components/HazeUI.jsx';
import { buildIncidents } from './lib/incidents.js';
import { fetchWind, FALLBACK_WIND } from './lib/wind.js';
import { fetchThermalHotspots } from './lib/thermal.js';
import { distanceMeters } from './lib/geo.js';
import { isPointInCaraga } from './lib/haze.js';
import {
  subscribeToReports, addReport, usingFirebase,
  subscribeToAirQualitySignals, subscribeToPostApprovals, approveForPost, revokePostApproval,
} from './lib/reportsStore.js';

// Wind and the Indonesia haze forecast both refresh on this cadence.
const REFRESH_MS = 2 * 60 * 1000;

export default function App() {
  const [reports, setReports] = useState([]);
  const [facebookLeads, setFacebookLeads] = useState([]);
  const [airQualitySignals, setAirQualitySignals] = useState([]);
  const [thermalHotspots, setThermalHotspots] = useState([]);
  const [postApprovals, setPostApprovals] = useState({});
  const [wind, setWind] = useState(FALLBACK_WIND);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('list'); // list | report | levels
  const [pendingLocation, setPendingLocation] = useState(null);
  const [horizonMinutes, setHorizonMinutes] = useState(30);
  const [showStations, setShowStations] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const [hazeOn, setHazeOn] = useState(false); // haze is a map layer, not a separate mode
  const [hazeFrame, setHazeFrame] = useState(0); // 0..24, 3 h apart
  const [hazeFocus, setHazeFocus] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [evacuationIncidentId, setEvacuationIncidentId] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const haze = useHaze(hazeOn);

  // Firebase Realtime Database when configured, in-memory sample data
  // otherwise — reportsStore.js hides which one this is.
  useEffect(() => subscribeToReports(setReports), []);
  useEffect(() => subscribeToAirQualitySignals(setAirQualitySignals), []);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchThermalHotspots().then((hotspots) => {
      if (!cancelled) setThermalHotspots(hotspots);
    });
    refresh();
    const id = setInterval(refresh, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  useEffect(() => subscribeToPostApprovals(setPostApprovals), []);

  useEffect(() => {
    let cancelled = false;
    fetchWind().then((w) => !cancelled && setWind(w));
    const id = setInterval(() => {
      fetchWind().then((w) => !cancelled && setWind(w));
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // If this device has already granted location access, keep the private
  // marker current without requiring another button press.
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setLocationAccuracy(position.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Elapsed time feeds escalation, so recompute on a timer.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const incidents = useMemo(
    () => buildIncidents(reports, wind, airQualitySignals, thermalHotspots),
    [reports, wind, airQualitySignals, thermalHotspots, tick]
  );
  const airQualityActive = airQualitySignals.some((signal) => {
    const detectedAt = new Date(signal.detectedAt).getTime();
    return Number.isFinite(detectedAt) && Date.now() - detectedAt <= 30 * 60 * 1000;
  });
  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const nearbyIncident = userLocation
    ? incidents
      .map((incident) => ({ incident, distance: distanceMeters(userLocation, incident.location) }))
      .filter(({ distance }) => distance <= 500)
      .sort((a, b) => a.distance - b.distance)[0]?.incident ?? null
    : null;
  const nearbyIncidentId = nearbyIncident?.id ?? null;

  useEffect(() => {
    setEvacuationIncidentId((current) => {
      if (!nearbyIncidentId) return null;
      return current === nearbyIncidentId ? current : nearbyIncidentId;
    });
  }, [nearbyIncidentId]);

  // 'confirmed' means 2+ independent reports already agree — that
  // corroboration is itself the safety check, so these post without
  // waiting on an admin. Only single-source 'unverified' incidents need a
  // person to click Approve (see IncidentPanel). Runs whenever the
  // incident list changes; skips anything already recorded either way.
  useEffect(() => {
    for (const incident of incidents) {
      if (
        incident.triage.status === 'confirmed' &&
        incident.triage.autoPost &&
        !(incident.id in postApprovals)
      ) {
        approveForPost(incident.id, 'auto-corroborated');
      }
    }
  }, [incidents, postApprovals]);

  const changeHorizon = useCallback((next) => {
    setHorizonMinutes((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  // Passed down into MapView -> the memoized LocalLayer (see MapView.jsx).
  // An inline arrow here would get a new reference every render — including
  // every haze-timeline tick — which would defeat that memoization and
  // force every fire pin to re-render for no reason.
  const selectIncident = useCallback((id) => {
    setView('list');
    setSelectedId(id);
    setHorizonMinutes(30);
    setRailOpen(true);
  }, []);

  function submitReport(report) {
    addReport(report);
    setView('list');
    setPendingLocation(null);
    setSelectedId(report.id);
    setHorizonMinutes(30);
  }

  function reportExistingFire(location) {
    setPendingLocation([...location]);
    setView('report');
    setSelectedId(null);
  }

  function toggleHaze(on) {
    setHazeOn(on);
    setShowStations(!on);
    if (on) {
      setView('list');
      setSelectedId(null);
      setPendingLocation(null);
      setRailOpen(true);
    }
  }

  const reporting = !hazeOn && view === 'report';
  const userInCaraga = userLocation ? isPointInCaraga(userLocation) : false;

  let rail;
  if (hazeOn) {
    rail = (
      <HazePanel
        haze={haze}
        frame={hazeFrame}
        onFocus={(c) => setHazeFocus([...c])}
        userLocation={userLocation}
        userInCaraga={userInCaraga}
      />
    );
  } else if (reporting) {
    rail = (
      <ReportForm
        location={pendingLocation}
        incidents={incidents}
        onPlaceRequest={setPendingLocation}
        onSubmit={submitReport}
        onCancel={() => {
          setView('list');
          setPendingLocation(null);
        }}
      />
    );
  } else if (view === 'levels') {
    rail = (
      <WarningSystem
        activeLevel={selected ? selected.alarm.level : null}
        onClose={() => setView('list')}
      />
    );
  } else if (selected) {
    rail = (
      <IncidentPanel
        incident={selected}
        horizonMinutes={horizonMinutes}
        onBack={() => setSelectedId(null)}
        onOpenLevels={() => setView('levels')}
        postApproval={postApprovals[selected.id] ?? null}
        onApprovePost={() => approveForPost(selected.id)}
        onRevokePost={() => revokePostApproval(selected.id)}
        onReportFire={reportExistingFire}
      />
    );
  } else {
    rail = (
      <Sidebar
        incidents={incidents}
        wind={wind}
        selectedId={selectedId}
        showStations={showStations}
        onToggleStations={() => setShowStations((s) => !s)}
        onSelect={setSelectedId}
        airQualityActive={airQualityActive}
        onReport={() => {
          setView('report');
          setSelectedId(null);
        }}
        onOpenLevels={() => setView('levels')}
      />
    );
  }

  return (
    <div className={`app ${railOpen ? '' : 'rail-collapsed'}`}>
      <aside className="rail" key={hazeOn ? 'haze' : reporting ? 'report' : view + (selectedId ?? '')}>
        {rail}
      </aside>

      <button
        className="rail-handle"
        onClick={() => setRailOpen((o) => !o)}
        aria-expanded={railOpen}
        aria-label={railOpen ? 'Hide panel' : 'Show panel'}
        title={railOpen ? 'Hide panel' : 'Show panel'}
      >
        <span className="rail-handle-arrow" />
      </button>

      <main className="stage">
        <HazeToggle on={hazeOn} onChange={toggleHaze} />

        <NotificationCenter
          incidents={incidents}
          onSelect={(id) => {
            setHazeOn(false);
            setView('list');
            setSelectedId(id);
            setHorizonMinutes(30);
            setRailOpen(true);
          }}
          onOpenAdmin={() => setAdminOpen(true)}
        />

        {adminOpen && <AdminPanel reports={reports} onClose={() => setAdminOpen(false)} />}

        {!usingFirebase && !hazeOn && (
          <div className="db-flag" title="Copy .env.example to .env.local with your Firebase project to go live">
            Sample data — connect Firebase to go live
          </div>
        )}

        <MapView
          incidents={incidents}
          selectedId={selectedId}
          onSelect={selectIncident}
          placing={reporting}
          pendingLocation={pendingLocation}
          onPickLocation={setPendingLocation}
          horizonMinutes={horizonMinutes}
          showStations={showStations}
          railOpen={railOpen}
          hazeMode={hazeOn}
          haze={haze.data}
          hazeFrame={hazeFrame}
          hazeFocus={hazeFocus}
          userLocation={userLocation}
          userLocationAccuracy={locationAccuracy}
        />

        {reporting && <div className="map-hint">Tap the map where the fire is</div>}

        {hazeOn && haze.data?.frames && (
          <HazeTimeline frame={hazeFrame} onChange={setHazeFrame} baseTime={haze.data.baseTime} />
        )}

        {!hazeOn && selected && selected.alarm.level > 0 && !reporting && (
          <Timeline
            minutes={horizonMinutes}
            onChange={changeHorizon}
            alarmColor={selected.alarm.color}
          />
        )}
      </main>

      {nearbyIncident && evacuationIncidentId && createPortal(
        <div className="evacuation-backdrop" role="presentation">
          <section className="evacuation-modal" role="alertdialog" aria-modal="true" aria-labelledby="evacuation-title">
            <div className="evacuation-icon" aria-hidden="true">!</div>
            <p className="evacuation-kicker">You are within 500 m of a reported fire</p>
            <h2 id="evacuation-title">EVACUATE NOW</h2>
            <p>Move away from the fire and smoke immediately. Follow official evacuation instructions.</p>
            <ul>
              <li>Leave by the safest route away from smoke and flames.</li>
              <li>Do not return for belongings or approach electrical lines.</li>
              <li>Call emergency services when you are in a safe location.</li>
            </ul>
            <button className="primary block" onClick={() => setEvacuationIncidentId(null)}>I understand</button>
          </section>
        </div>,
        document.body
      )}

    </div>
  );
}