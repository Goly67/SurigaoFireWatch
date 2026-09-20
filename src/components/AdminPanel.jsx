import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { deleteReport, setReportStatus, updateReport } from '../lib/reportsStore.js';

const STATUS_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export default function AdminPanel({ reports = [], onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => setUser(nextUser));
  }, []);

  const queue = useMemo(() => [...reports].sort((a, b) => {
    const statusRank = { pending: 0, approved: 1, rejected: 2 };
    return (statusRank[a.status ?? 'approved'] ?? 99) - (statusRank[b.status ?? 'approved'] ?? 99)
      || new Date(b.reportedAt) - new Date(a.reportedAt);
  }), [reports]);

  async function handleLogin(event) {
    event.preventDefault();
    if (!auth) {
      setLoginError('Firebase Auth is not configured yet. Add the Firebase Auth values to .env.local.');
      return;
    }
    try {
      setLoginError('');
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch (error) {
      setLoginError(error.message || 'Unable to sign in.');
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    await signOut(auth);
  }

  return (
    <div className="admin-overlay" role="presentation" onClick={onClose}>
      <aside className="admin-panel" role="dialog" aria-modal="true" aria-label="Admin panel" onClick={(event) => event.stopPropagation()}>
        <div className="admin-head">
          <div>
            <p className="admin-kicker">Admin access</p>
            <h2>Fire review panel</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close admin panel" title="Close admin panel">
            <span className="icon-close" aria-hidden="true" />
          </button>
        </div>

        {!user ? (
          <form className="admin-login" onSubmit={handleLogin}>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@yourdomain.com" required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter admin password" required />
            </label>
            {loginError && <p className="admin-error">{loginError}</p>}
            <button className="primary block" type="submit">Log in to admin panel</button>
          </form>
        ) : (
          <>
            <div className="admin-user-bar">
              <span>Signed in as {user.email}</span>
              <button className="secondary" onClick={handleSignOut}>Sign out</button>
            </div>

            <div className="admin-list">
              {queue.length === 0 && <p className="muted small">No reports in the queue.</p>}

              {queue.map((report) => (
                <article key={report.id} className={`admin-report admin-report--${report.status ?? 'approved'}`}>
                  <div className="admin-report-head">
                    <strong>{report.barangayId ?? 'Reported fire'}</strong>
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
          </>
        )}
      </aside>
    </div>
  );
}
