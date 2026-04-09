import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';

interface ReportModalProps {
  onClose: () => void;
  reportedUserId?: string;
  messageId?: string;
  hubId?: string;
  messageContent?: string;
}

const CATEGORIES = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'nsfw', label: 'NSFW Content' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'pii', label: 'Personal Information Sharing' },
  { value: 'other', label: 'Other' },
];

export default function ReportModal({ onClose, reportedUserId, messageId, hubId, messageContent }: ReportModalProps) {
  const [category, setCategory] = useState('other');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason');
      return;
    }
    if (!reportedUserId && !messageId) {
      setError('Unable to identify the reported content');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.createReport({
        reported_user_id: reportedUserId,
        message_id: messageId,
        hub_id: hubId,
        reason: reason.trim(),
        category,
        message_content: messageContent,
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-riftapp-panel rounded-xl border border-riftapp-border/50 shadow-modal w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {success ? (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">Report Submitted</div>
            <p className="text-riftapp-text-dim text-sm">Thank you. Our moderation team will review this report.</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-4">Report Content</h2>

            <label className="block text-xs font-semibold uppercase tracking-wider text-riftapp-text-dim mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-riftapp-content border border-riftapp-border/40 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-riftapp-accent"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold uppercase tracking-wider text-riftapp-text-dim mb-1.5">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why you are reporting this content..."
              rows={4}
              className="w-full bg-riftapp-content border border-riftapp-border/40 rounded-lg px-3 py-2 text-sm mb-4 resize-none focus:outline-none focus:ring-1 focus:ring-riftapp-accent"
            />

            {error && <p className="text-riftapp-danger text-sm mb-3">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-riftapp-content-elevated hover:bg-riftapp-content text-riftapp-text-dim transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-lg bg-riftapp-danger text-white hover:bg-riftapp-danger/80 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
