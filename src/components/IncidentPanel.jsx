import { composePost } from '../lib/verification.js';
import { projectSpread } from '../lib/fireSpread.js';
import { ALARM_LEVELS } from '../lib/alarmLevels.js';

function driveFileId(url) {
  return url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/i)?.[1] ?? null;
}

function EvidencePreview({ url }) {
  const id = driveFileId(url);
  if (id) {
    return (
      <iframe
        className="evidence-preview"
        src={`https://drive.google.com/file/d/${id}/preview`}
        title="Google Drive photo or video preview"
        allow="autoplay"
      />
    );
  }
  return (
    <a className="evidence-preview-link" href={url} target="_blank" rel="noreferrer">
      Open Google Photos photo or video
    </a>
  );
}

const relative = (minutes) => {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  return `${(minutes / 60).toFixed(1)} h ago`;
};

export default function IncidentPanel({
  incident, horizonMinutes, onBack, onOpenLevels,
  postApproval, onApprovePost, onRevokePost, onReportFire,
}) {
  const thirty = incident.projections.find((p) => p.minutes === 30);
  const scrubbed = projectSpread({ ...incident.spreadParams, minutes: horizonMinutes });
  const held = incident.alarm.level === 0;
  const post = incident.triage.autoPost ? composePost(incident, incident.alarm) : null;
  const evidenceLinks = incident.reports.filter((r) => r.driveUrl);
  const reportsNeeded = Math.max(0, ALARM_LEVELS[0].minReports - incident.reports.length);
  const nextReportAlarm = ALARM_LEVELS.find((level) => incident.reports.length < level.minReports);
  const nextReportsNeeded = nextReportAlarm
    ? nextReportAlarm.minReports - incident.reports.length
    : 0;

  return (
    <div className="panel incident-panel">
      <div className="panel-head">
        <button className="icon-button" onClick={onBack} aria-label="All incidents" title="All incidents">
          <span className="icon-back" aria-hidden="true" />
        </button>
        <button className="icon-button" onClick={onOpenLevels} aria-label="5 levels" title="5 levels">
          <span className="icon-warning-levels" aria-hidden="true">!</span>
        </button>
      </div>

      <div className={`alarm-head ${held ? 'is-held' : ''}`} style={{ '--alarm': incident.alarm.color }}>
        <span className="alarm-code">{incident.alarm.code}</span>
        <div>
          <h2>{incident.alarm.label}</h2>
          <p>{incident.barangayName} · {relative(incident.minutesElapsed)}</p>
        </div>
      </div>

      <p className="alarm-summary">{incident.alarm.summary}</p>
      <p className="incident-note">{incident.note}</p>
      <p className="report-count">
        PERSON {incident.reports.length} REPORTED THIS FIRE
      </p>

      {evidenceLinks.length > 0 && (
        <div className="evidence-links">
          {evidenceLinks.map((r) => (
            <div key={r.id} className="evidence-item">
              <EvidencePreview url={r.driveUrl} />
              <a className="evidence-chip" href={r.driveUrl} target="_blank" rel="noreferrer">
                <DriveGlyph /> View evidence from {relative(
                  (Date.now() - new Date(r.reportedAt)) / 60000
                )}
              </a>
            </div>
          ))}
        </div>
      )}

      {held ? (
        <p className="muted small">
          Not dispatched. {reportsNeeded} more report{reportsNeeded === 1 ? '' : 's'} within
          200 m in the next ten minutes promote{reportsNeeded === 1 ? 's' : ''} this to a
          1st Alarm on its own.
        </p>
      ) : (
        <>
          {nextReportAlarm ? (
            <p className="report-progress">
              {nextReportsNeeded} more report{nextReportsNeeded === 1 ? '' : 's'} within 200 m
              to reach {nextReportAlarm.label}.
            </p>
          ) : (
            <p className="report-progress">5th Alarm report threshold reached.</p>
          )}
          <dl className="stats">
            <div>
              <dt>Heading</dt>
              <dd>{incident.headDirection}</dd>
            </div>
            <div>
              <dt>Rate of spread</dt>
              <dd>{thirty.rosMetresPerMin.toFixed(1)} m/min</dd>
            </div>
            <div className="is-live">
              <dt>At +{Math.round(horizonMinutes)} min</dt>
              <dd>~{scrubbed.estimatedStructures} structures</dd>
            </div>
            <div className="is-live">
              <dt>Front distance</dt>
              <dd>{scrubbed.headDistanceM.toFixed(0)} m</dd>
            </div>
          </dl>

          <p className="muted small">
            {incident.fuelLabel}. Drag the timeline under the map to walk the front
            forward. {incident.reports.length} independent report
            {incident.reports.length > 1 ? 's' : ''} so far.
          </p>

          {incident.alarm.escalatedBy > 0 && (
            <p className="escalation">
              Raised {incident.alarm.escalatedBy} level
              {incident.alarm.escalatedBy > 1 ? 's' : ''} above the size estimate —
              independent reports and time on the clock both point to a bigger fire.
            </p>
          )}

          <section>
            <h3>Responding</h3>
            <ul className="stations">
              {incident.stations.slice(0, 4).map((s, i) => (
                <li key={s.id} style={{ '--step': i }}>
                  <span>
                    <strong>{s.name}</strong>
                    <br />
                    <span className="muted small">{s.city} · {s.region}</span>
                    {s.contact && (
                      <>
                        <br />
                        <a className="tel" href={`tel:${s.contact.replace(/\s/g, '')}`}>{s.contact}</a>
                      </>
                    )}
                  </span>
                  <span className="muted mono">{(s.distanceM / 1000).toFixed(1)} km</span>
                </li>
              ))}
            </ul>
            <p className="muted small">{incident.alarm.respondingUnits} under this level.</p>
          </section>
        </>
      )}

      {post && (
        <section>
          <h3>{postApproval ? 'Approved for Facebook' : 'Eligible for Facebook — needs approval'}</h3>
          <pre className="post-preview">{post}</pre>
          {postApproval ? (
            <>
              <p className="muted small">
                {postApproval.by === 'auto-corroborated'
                  ? `Auto-approved ${relative((Date.now() - new Date(postApproval.approvedAt)) / 60000)} — 2+ independent reports already confirmed this one, so it didn't need to wait on anyone.`
                  : `Approved by an admin ${relative((Date.now() - new Date(postApproval.approvedAt)) / 60000)}.`}
                {' '}The posting job publishes approved incidents on its next run —
                nothing posts straight from this screen.
              </p>
              <button className="ghost" onClick={onRevokePost}>Undo approval</button>
            </>
          ) : (
            <>
              <p className="muted small">
                This is a single, uncorroborated report — nothing goes to the public
                Page until someone confirms it. If a second independent report comes
                in for the same fire, it'll approve itself automatically.
              </p>
              <button className="primary" onClick={onApprovePost}>Approve to publish</button>
            </>
          )}
        </section>
      )}

      <section className="report-fire-cta">
        <strong>Fire is getting big?</strong>
        <button className="primary block" onClick={() => onReportFire(incident.location)}>
          Report fire
        </button>
        <p className="muted small">Your report will be added to this fire at its current location.</p>
      </section>
    </div>
  );
}

/** Generic link glyph — not a reproduction of any platform's logo. */
function DriveGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="drive-glyph" aria-hidden="true">
      <path d="M9.5 14.5l5-5M10.8 8.2l1-1a3 3 0 0 1 4.2 4.2l-1.4 1.4M13.2 15.8l-1 1a3 3 0 0 1-4.2-4.2l1.4-1.4" />
    </svg>
  );
}
