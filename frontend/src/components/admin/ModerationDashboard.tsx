import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Report } from '../../types';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-500/20 text-yellow-400',
  reviewing: 'bg-blue-500/20 text-blue-400',
  resolved: 'bg-green-500/20 text-green-400',
  dismissed: 'bg-gray-500/20 text-gray-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  harassment: 'Harassment',
  spam: 'Spam',
  nsfw: 'NSFW',
  hate_speech: 'Hate Speech',
  pii: 'PII',
  other: 'Other',
};

export default function ModerationDashboard() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total_reports: number; open: number; resolved: number; dismissed: number; flagged_images: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNote, setActionNote] = useState('');
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listReports({ status: statusFilter || undefined, category: categoryFilter || undefined, limit: 50 });
      setReports(res.reports);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('forbidden')) {
        setAccessDenied(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load reports');
      }
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const s = await api.getModerationStats();
      setStats(s);
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('forbidden')) {
        setAccessDenied(true);
      }
    }
  };

  useEffect(() => { loadReports(); loadStats(); }, [statusFilter, categoryFilter]);

  const handleUpdateStatus = async (id: string, status: string) => {
    setError('');
    try {
      await api.updateReport(id, { status, note: actionNote || undefined });
      setActionNote('');
      setSelectedReport(null);
      loadReports();
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleAction = async (reportId: string, actionType: string, targetUserId?: string) => {
    setError('');
    try {
      await api.takeReportAction(reportId, { action_type: actionType, target_user_id: targetUserId });
      loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  if (accessDenied) {
    return (
      <div className="flex-1 flex items-center justify-center bg-riftapp-content">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-riftapp-text-dim mb-4">You do not have permission to access the moderation dashboard.</p>
          <button onClick={() => navigate('/app')} className="px-4 py-2 text-sm rounded-lg bg-riftapp-accent text-white hover:bg-riftapp-accent-hover transition-colors">
            Go to App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-riftapp-content">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Moderation Dashboard</h1>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard label="Total Reports" value={stats.total_reports} />
            <StatCard label="Open" value={stats.open} color="text-yellow-400" />
            <StatCard label="Resolved" value={stats.resolved} color="text-green-400" />
            <StatCard label="Dismissed" value={stats.dismissed} color="text-gray-400" />
            <StatCard label="Flagged Images" value={stats.flagged_images} color="text-red-400" />
          </div>
        )}

        <div className="flex gap-3 mb-6">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-riftapp-content-elevated border border-riftapp-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-riftapp-content-elevated border border-riftapp-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="ml-auto text-sm text-riftapp-text-dim self-center">{total} reports</span>
        </div>

        {error && <p className="text-riftapp-danger text-sm mb-4">{error}</p>}

        {loading ? (
          <div className="text-center py-16 text-riftapp-text-dim">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-riftapp-text-dim">No reports found</div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className={`bg-riftapp-content-elevated border border-riftapp-border/30 rounded-lg p-4 cursor-pointer hover:border-riftapp-border/60 transition-colors ${selectedReport?.id === r.id ? 'ring-1 ring-riftapp-accent' : ''}`}
                onClick={() => setSelectedReport(selectedReport?.id === r.id ? null : r)}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${STATUS_COLORS[r.status] || 'bg-gray-500/20 text-gray-400'}`}>
                    {r.status}
                  </span>
                  <span className="text-xs text-riftapp-text-dim px-2 py-0.5 rounded bg-white/5">{CATEGORY_LABELS[r.category] || r.category}</span>
                  <span className="text-xs text-riftapp-text-dim ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm mb-1">
                  <span className="text-riftapp-text-dim">Reporter:</span> {r.reporter_name || r.reporter_id.slice(0, 8)}
                  {r.reported_name && <> <span className="text-riftapp-text-dim ml-3">Reported:</span> {r.reported_name}</>}
                  {r.hub_name && <> <span className="text-riftapp-text-dim ml-3">Hub:</span> {r.hub_name}</>}
                </p>
                <p className="text-sm text-riftapp-text-muted">{r.reason}</p>

                {selectedReport?.id === r.id && (
                  <div className="mt-4 pt-4 border-t border-riftapp-border/30">
                    {r.message_content && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold uppercase text-riftapp-text-dim mb-1">Reported Message</p>
                        <div className="bg-riftapp-content rounded-lg p-3 text-sm">{r.message_content}</div>
                      </div>
                    )}

                    {r.auto_moderation && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold uppercase text-riftapp-text-dim mb-1">AI Analysis</p>
                        <div className="bg-riftapp-content rounded-lg p-3 text-sm space-y-1">
                          {r.auto_moderation.results?.map((res, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${res.flagged ? 'bg-red-500' : 'bg-green-500'}`} />
                              <span className="font-medium">{res.classifier}</span>
                              <span className="text-riftapp-text-dim">{(res.confidence * 100).toFixed(0)}%</span>
                              {res.severity !== 'none' && <span className="text-xs text-riftapp-text-dim">({res.severity})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-3">
                      <textarea
                        value={actionNote}
                        onChange={(e) => setActionNote(e.target.value)}
                        placeholder="Moderator note (optional)"
                        rows={2}
                        className="w-full bg-riftapp-content border border-riftapp-border/40 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {r.status === 'open' && (
                        <button onClick={() => handleUpdateStatus(r.id, 'reviewing')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors">
                          Mark Reviewing
                        </button>
                      )}
                      <button onClick={() => handleUpdateStatus(r.id, 'resolved')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors">
                        Resolve
                      </button>
                      <button onClick={() => handleUpdateStatus(r.id, 'dismissed')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors">
                        Dismiss
                      </button>
                      {r.reported_user_id && (
                        <>
                          <button onClick={() => handleAction(r.id, 'warn', r.reported_user_id!)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors">
                            Warn User
                          </button>
                          <button onClick={() => handleAction(r.id, 'ban', r.reported_user_id!)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                            Ban User
                          </button>
                        </>
                      )}
                      {r.message_id && (
                        <button onClick={() => handleAction(r.id, 'delete_message')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                          Delete Message
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-riftapp-content-elevated border border-riftapp-border/30 rounded-lg p-4">
      <p className="text-xs text-riftapp-text-dim uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
