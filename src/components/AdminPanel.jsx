import { useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { deleteReport, setReportStatus, updateReport } from '../lib/reportsStore.js';

const STATUS_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const ADMIN_EMAILS = ['forestparty223@gmail.com'];
const ADMIN_STORAGE_KEY = 'sfw-admin-panel-state-v1';

function isAuthorizedAdmin(user) {
  return !!user && typeof user.email === 'string' && ADMIN_EMAILS.includes(user.email.toLowerCase());
}

function readStoredPanelState() {
  if (typeof window === 'undefined') return { activeTab: 'queue', isCompact: false };

  try {
    const saved = window.localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!saved) return { activeTab: 'queue', isCompact: false };
    const parsed = JSON.parse(saved);
    return {
      activeTab: parsed.activeTab === 'submitted' ? 'submitted' : 'queue',
      isCompact: Boolean(parsed.isCompact),
    };
  } catch {
    return { activeTab: 'queue', isCompact: false };
  }
}

export default function AdminPanel({ reports = [], onClose }) {
  const [loginError, setLoginError] = useState('');
  const [user, setUser] = useState(null);
  const [panelState, setPanelState] = useState(readStoredPanelState);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(panelState));
    }
  }, [panelState]);

  useEffect(() => {
    if (!auth) return undefined;

    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        return;
      }

      if (!isAuthorizedAdmin(nextUser)) {
        setLoginError('This Google account is not authorized for admin access.');
        await signOut(auth);
        setUser(null);
        return;
      }

      setLoginError('');
      setUser(nextUser);
    });
  }, []);

  const queue = useMemo(() => [...reports].sort((a, b) => {
    const statusRank = { pending: 0, approved: 1, rejected: 2 };
    return (statusRank[a.status ?? 'approved'] ?? 99) - (statusRank[b.status ?? 'approved'] ?? 99)
      || new Date(b.reportedAt) - new Date(a.reportedAt);
  }), [reports]);

  const submittedReports = useMemo(() => [...reports]
    .filter((report) => report && typeof report.id === 'string')
    .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)), [reports]);

  async function handleGoogleLogin() {
    if (!auth) {
      setLoginError('Firebase Auth is not configured yet. Add the Firebase Auth values to .env.local.');
      return;
    }

    try {
      setLoginError('');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      setLoginError(error.message || 'Unable to sign in with Google.');
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    await signOut(auth);
  }

  const toggleCompact = () => {
    setPanelState((current) => ({ ...current, isCompact: !current.isCompact }));
  };

  return (
    <div className="admin-overlay" role="presentation" onClick={onClose}>
      <aside className={`admin-panel ${panelState.isCompact ? 'admin-panel--compact' : ''}`} role="dialog" aria-modal="true" aria-label="Admin panel" onClick={(event) => event.stopPropagation()}>
        <div className="admin-head">
          <div>
            <p className="admin-kicker">Admin access</p>
            <h2>Fire review panel</h2>
          </div>
          <div className="admin-head-tools">
            <button className="secondary small-button" type="button" onClick={toggleCompact}>
              {panelState.isCompact ? 'Expand' : 'Compact'}
            </button>
            <button className="icon-button" onClick={onClose} aria-label="Close admin panel" title="Close admin panel">
              <span className="icon-close" aria-hidden="true" />
            </button>
          </div>
        </div>

        {!user ? (
          <div className="admin-login">
            <p className="muted">Use your Google account to access the admin tools.</p>
            {loginError && <p className="admin-error">{loginError}</p>}
            <button className="primary block" type="button" onClick={handleGoogleLogin}>
              Continue with Google
            </button>
          </div>
        ) : (
          <>
            <div className="admin-user-bar">
              <span>Signed in as {user.email}</span>
              <button className="secondary" onClick={handleSignOut}>Sign out</button>
            </div>

            <div className="admin-tabs" role="tablist" aria-label="Admin sections">
              <button
                type="button"
                className={panelState.activeTab === 'queue' ? 'admin-tab is-active' : 'admin-tab'}
                onClick={() => setPanelState((current) => ({ ...current, activeTab: 'queue' }))}
              >
                Review queue ({queue.filter((report) => (report.status ?? 'pending') === 'pending').length})
              </button>
              <button
                type="button"
                className={panelState.activeTab === 'submitted' ? 'admin-tab is-active' : 'admin-tab'}
                onClick={() => setPanelState((current) => ({ ...current, activeTab: 'submitted' }))}
              >
                Submitted ({submittedReports.length})
              </button>
            </div>

            {panelState.activeTab === 'queue' ? (
              <div className="admin-list">
                {queue.length === 0 && <p className="muted small">No reports in the queue.</p>}

                {queue.map((report) => (
                  <article key={report.id} className={`admin-report admin-report--${report.status ?? 'approved'}`}>
                    <div className="admin-report-head">
                      <strong>{report.barangayId ?? 'Someone reported a fire'}</strong>
                      <span className={`status-pill status-pill--${report.status ?? 'approved'}`}>
                        {STATUS_LABEL[report.status ?? 'approved']}
                      </span>
                    </div>

                    <p className="admin-meta">{new Date(report.reportedAt).toLocaleString()} · {report.source}</p>

                    <label>
                      Notes
                      <textarea
                        value={report.note ?? ''}
                        onChange={(event) => updateReport(report.id, { note: event.target.value })}
                      />
                    </label>

                    <label>
                      Google Drive / Google Photos link
                      <input
                        type="url"
                        value={report.driveUrl ?? ''}
                        onChange={(event) => updateReport(report.id, { driveUrl: event.target.value || null })}
                      />
                    </label>

                    {report.driveUrl && (
                      <div className="admin-evidence">
                        <iframe
                          src={report.driveUrl.replace('https://drive.google.com/open?id=', 'https://drive.google.com/file/d/').replace(/\/view\?usp=.*/, '/preview')}
                          title={`Evidence for ${report.id}`}
                          allow="autoplay"
                        />
                      </div>
                    )}

                    <div className="admin-actions">
                      <button className="primary" onClick={() => setReportStatus(report.id, 'approved', user.email)}>Approve</button>
                      <button className="secondary" onClick={() => setReportStatus(report.id, 'rejected', user.email)}>Reject</button>
                      <button className="ghost danger" onClick={() => deleteReport(report.id)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-list">
                {submittedReports.length === 0 && <p className="muted small">No public reports submitted yet.</p>}

                {submittedReports.map((report) => (
                  <article key={`submitted-${report.id}`} className="admin-report admin-report--submitted">
                    <div className="admin-report-head">
                      <strong>Someone reported a fire</strong>
                      <span className={`status-pill status-pill--${report.status ?? 'pending'}`}>
                        {report.status ? STATUS_LABEL[report.status] : 'New'}
                      </span>
                    </div>

                    <p className="admin-meta">{new Date(report.reportedAt).toLocaleString()} · {report.source}</p>
                    <p className="admin-submission-note">{report.note || 'A community member reported a potential fire in the area.'}</p>

                    {report.driveUrl && (
                      <a href={report.driveUrl} target="_blank" rel="noreferrer" className="evidence-chip">
                        View evidence
                      </a>
                    )}

                    <div className="admin-actions">
                      <button className="primary" onClick={() => setReportStatus(report.id, 'approved', user.email)}>Approve</button>
                      <button className="secondary" onClick={() => setReportStatus(report.id, 'rejected', user.email)}>Reject</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
