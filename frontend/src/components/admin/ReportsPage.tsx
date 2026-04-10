import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/adminClient';
import type { Report } from '../../types';
import { formatShortDateTime } from '../../utils/dateTime';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-500/20 text-yellow-400', reviewing: 'bg-blue-500/20 text-blue-400',
  resolved: 'bg-green-500/20 text-green-400', dismissed: 'bg-gray-500/20 text-gray-400',
};

const CATEGORY_LABELS: Record<string, string> = {
  harassment: 'Harassment', spam: 'Spam', nsfw: 'NSFW', hate_speech: 'Hate Speech', pii: 'PII', other: 'Other',
};

export default function ReportsPage() {
  const reqRef = useRef(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [mutating, setMutating] = useState<string | null>(null);

  const loadReports = async () => {
    const id = ++reqRef.current;
    setLoading(true); setError('');
    try {
      const res = await adminApi.listReports({ status: statusFilter || undefined, category: categoryFilter || undefined, limit: 50 });
      if (id !== reqRef.current) return;
      setReports(res.reports); setTotal(res.total);
    } catch (err) {
      if (id !== reqRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  };

  const loadStats = async () => {
    try { const s = await adminApi.getModerationStats(); setStats(s); }
    catch (err) { console.error('Failed to load moderation stats:', err); }
  };

  useEffect(() => { loadReports(); loadStats(); }, [statusFilter, categoryFilter]);

  const handleStatus = async (id: string, status: string) => {
    if (mutating) return;
    setMutating(id);
    try {
      await adminApi.updateReport(id, { status, note: actionNote || undefined });
      setActionNote(''); setSelected(null); loadReports(); loadStats();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setMutating(null); }
  };

  const handleAction = async (reportId: string, actionType: string, targetUserId?: string) => {
    if (mutating) return;
    setMutating(reportId);
    try {
      await adminApi.takeReportAction(reportId, { action_type: actionType, target_user_id: targetUserId });
      setActionNote(''); setSelected(null);
      loadReports(); loadStats();
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setMutating(null); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total', value: stats.total_reports, color: 'text-white' },
            { label: 'Open', value: stats.open, color: 'text-yellow-400' },
            { label: 'Resolved', value: stats.resolved, color: 'text-[#57f287]' },
            { label: 'Dismissed', value: stats.dismissed, color: 'text-[#949ba4]' },
            { label: 'Flagged Images', value: stats.flagged_images, color: 'text-[#ed4245]' },
          ].map((s) => (
            <div key={s.label} className="bg-[#2b2d31] border border-[#3f4147]/30 rounded-xl p-4">
              <p className="text-xs text-[#949ba4] uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="">All Statuses</option>
          <option value="open">Open</option><option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-[#1e1f22] border border-[#3f4147]/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="ml-auto text-sm text-[#949ba4] self-center">{total} reports</span>
      </div>

      {error && <p className="text-[#ed4245] text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-8 h-8 border-2 border-[#00a8fc] border-t-transparent rounded-full animate-spin" /></div>
      ) : reports.length === 0 ? (
        <p className="text-center py-16 text-[#949ba4]">No reports found</p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id}
              className={`bg-[#2b2d31] border rounded-lg p-4 cursor-pointer hover:border-[#3f4147]/80 transition-colors ${selected?.id === r.id ? 'border-[#00a8fc]/50 ring-1 ring-[#00a8fc]/30' : 'border-[#3f4147]/30'}`}
              onClick={() => { setSelected(selected?.id === r.id ? null : r); setActionNote(''); }}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${STATUS_COLORS[r.status] || 'bg-gray-500/20 text-gray-400'}`}>{r.status}</span>
                <span className="text-xs text-[#949ba4] px-2 py-0.5 rounded bg-white/5">{CATEGORY_LABELS[r.category] || r.category}</span>
                <span className="text-xs text-[#949ba4] ml-auto">{formatShortDateTime(r.created_at)}</span>
              </div>
              <p className="text-sm"><span className="text-[#949ba4]">Reporter:</span> {r.reporter_name || r.reporter_id.slice(0, 8)}
                {r.reported_name && <> <span className="text-[#949ba4] ml-3">Reported:</span> {r.reported_name}</>}
              </p>
              <p className="text-sm text-[#b5bac1] mt-1">{r.reason}</p>

              {selected?.id === r.id && (
                <div className="mt-4 pt-4 border-t border-[#3f4147]/30" onClick={(e) => e.stopPropagation()}>
                  {r.message_content && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase text-[#949ba4] mb-1">Reported Message</p>
                      <div className="bg-[#1e1f22] rounded-lg p-3 text-sm text-white">{r.message_content}</div>
                    </div>
                  )}
                  <textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Moderator note (optional)" rows={2}
                    className="w-full bg-[#1e1f22] border border-[#3f4147]/40 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none mb-3" />
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'open' && <Btn disabled={mutating === r.id} onClick={() => handleStatus(r.id, 'reviewing')} color="blue">Mark Reviewing</Btn>}
                    <Btn disabled={mutating === r.id} onClick={() => handleStatus(r.id, 'resolved')} color="green">Resolve</Btn>
                    <Btn disabled={mutating === r.id} onClick={() => handleStatus(r.id, 'dismissed')} color="gray">Dismiss</Btn>
                    {r.reported_user_id && (
                      <>
                        <Btn disabled={mutating === r.id} onClick={() => handleAction(r.id, 'warn', r.reported_user_id!)} color="yellow">Warn</Btn>
                        <Btn disabled={mutating === r.id} onClick={() => handleAction(r.id, 'ban', r.reported_user_id!)} color="red">Ban</Btn>
                      </>
                    )}
                    {r.message_id && <Btn disabled={mutating === r.id} onClick={() => handleAction(r.id, 'delete_message')} color="red">Delete Message</Btn>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const COLORS: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
  green: 'bg-[#57f287]/20 text-[#57f287] hover:bg-[#57f287]/30',
  gray: 'bg-[#949ba4]/20 text-[#949ba4] hover:bg-[#949ba4]/30',
  yellow: 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
  red: 'bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30',
};

function Btn({ children, onClick, disabled, color }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; color: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${COLORS[color] || COLORS.gray}`}>
      {children}
    </button>
  );
}
