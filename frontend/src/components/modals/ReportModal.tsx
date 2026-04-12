import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import ModalOverlay from '../shared/ModalOverlay';
import { formatShortDate, formatShortTime, isSameCalendarDay } from '../../utils/dateTime';
import { publicAssetUrl } from '../../utils/publicAssetUrl';

interface ReportModalProps {
  onClose: () => void;
  reportedUserId?: string;
  messageId?: string;
  hubId?: string;
  messageContent?: string;
  messageCreatedAt?: string;
  messageAuthorName?: string;
  messageAuthorAvatarUrl?: string;
  messageHasAttachments?: boolean;
}

type ReportOption = {
  id: string;
  category: string;
  label: string;
  detailTitle: string;
  detailPlaceholder: string;
};

const REPORT_OPTIONS: ReportOption[] = [
  {
    id: 'dislike',
    category: 'other',
    label: "I don't like it",
    detailTitle: 'What feels off about this message?',
    detailPlaceholder: 'Tell us what you want reviewed.',
  },
  {
    id: 'spam',
    category: 'spam',
    label: 'Spam',
    detailTitle: 'How is this message spam?',
    detailPlaceholder: 'Describe the spam, scam, or repetitive behavior.',
  },
  {
    id: 'harassment',
    category: 'harassment',
    label: 'Abuse or harassment',
    detailTitle: 'What happened?',
    detailPlaceholder: 'Describe the abusive or harassing behavior.',
  },
  {
    id: 'harmful',
    category: 'hate_speech',
    label: 'Harmful misinformation or glorifying violence',
    detailTitle: 'What is harmful about this message?',
    detailPlaceholder: 'Explain the misinformation, violent praise, or hateful content.',
  },
  {
    id: 'pii',
    category: 'pii',
    label: 'Exposing private identifying information',
    detailTitle: 'What private information is being exposed?',
    detailPlaceholder: 'Describe the personal or identifying information in the message.',
  },
  {
    id: 'something-else',
    category: 'other',
    label: 'Something else',
    detailTitle: 'What should we know about this report?',
    detailPlaceholder: 'Give any details that will help moderators review it.',
  },
];

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden>
      <path d="M18 6L6 18" strokeLinecap="round" />
      <path d="M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAttachment() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.2a2 2 0 1 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSuccess() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatPreviewTimestamp(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  if (isSameCalendarDay(date, now)) {
    return formatShortTime(date);
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) {
    return `Yesterday at ${formatShortTime(date)}`;
  }

  return `${formatShortDate(date)} ${formatShortTime(date)}`;
}

function messagePreviewText(messageContent?: string, messageHasAttachments?: boolean) {
  const trimmed = messageContent?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (messageHasAttachments) {
    return 'Attachment included';
  }
  return 'No message preview available';
}

export default function ReportModal({
  onClose,
  reportedUserId,
  messageId,
  hubId,
  messageContent,
  messageCreatedAt,
  messageAuthorName,
  messageAuthorAvatarUrl,
  messageHasAttachments,
}: ReportModalProps) {
  const [selectedOption, setSelectedOption] = useState<ReportOption | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const previewTimestamp = useMemo(() => formatPreviewTimestamp(messageCreatedAt), [messageCreatedAt]);
  const previewText = useMemo(() => messagePreviewText(messageContent, messageHasAttachments), [messageContent, messageHasAttachments]);
  const authorLabel = messageAuthorName?.trim() || 'Unknown User';
  const avatarUrl = publicAssetUrl(messageAuthorAvatarUrl);
  const showDetailsStep = selectedOption != null && !success;

  const handleSelectOption = (option: ReportOption) => {
    setSelectedOption(option);
    setError('');
  };

  const handleSubmit = async () => {
    if (!selectedOption) {
      setError('Select a report reason first.');
      return;
    }
    if (!reason.trim()) {
      setError('Please give moderators a little context.');
      return;
    }
    if (!reportedUserId && !messageId) {
      setError('Unable to identify the reported message.');
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
        category: selectedOption.category,
        message_content: messageContent,
      });
      setSuccess(true);
      window.setTimeout(onClose, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay isOpen onClose={onClose} backdropClose={!submitting} zIndex={320}>
      <div className="w-[min(92vw,420px)] overflow-hidden rounded-[18px] bg-[#313338] text-[#f2f3f5] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="border-b border-white/6 px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            {showDetailsStep ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedOption(null);
                  setReason('');
                  setError('');
                }}
                className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#b5bac1] transition-colors hover:bg-white/6 hover:text-[#f2f3f5]"
                aria-label="Back"
              >
                <IconChevronLeft />
              </button>
            ) : (
              <div className="h-7 w-7 shrink-0" aria-hidden />
            )}

            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-[20px] font-semibold leading-none tracking-[-0.02em]">
                {success ? 'Report sent' : 'Report message'}
              </h2>
              <p className="mt-2 text-[12.5px] leading-5 text-[#b5bac1]">
                {success
                  ? 'Thanks. The message has been sent to moderators for review.'
                  : showDetailsStep
                    ? 'Give us a short explanation so moderators can review this faster.'
                    : 'Please select the option that best describes the problem.'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#b5bac1] transition-colors hover:bg-white/6 hover:text-[#f2f3f5] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Close"
            >
              <IconClose />
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#248046]/18 text-[#43b581]">
                <IconSuccess />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[#f2f3f5]">Report submitted</p>
                <p className="mt-1 text-[13px] leading-5 text-[#b5bac1]">You can close this window now.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Selected Message</div>
              <div className="mt-2 rounded-xl border border-white/6 bg-[#2b2d31] px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#5865f2] text-[15px] font-semibold text-white">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{authorLabel.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-[#f2f3f5]">{authorLabel}</span>
                      {previewTimestamp ? (
                        <span className="truncate text-[11px] text-[#949ba4]">{previewTimestamp}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] leading-5 text-[#dbdee1]">
                      {messageHasAttachments ? (
                        <span className="shrink-0 text-[#b5bac1]"><IconAttachment /></span>
                      ) : null}
                      <span className="truncate">{previewText}</span>
                    </div>
                  </div>
                </div>
              </div>

              {!showDetailsStep ? (
                <div className="mt-4 overflow-hidden rounded-xl bg-[#2b2d31] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  {REPORT_OPTIONS.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectOption(option)}
                      className={[
                        'flex w-full items-center justify-between px-4 py-4 text-left transition-colors',
                        index < REPORT_OPTIONS.length - 1 ? 'border-b border-white/6' : '',
                        'hover:bg-white/[0.035]',
                      ].join(' ')}
                    >
                      <span className="pr-4 text-[14px] font-medium text-[#f2f3f5]">{option.label}</span>
                      <span className="shrink-0 text-[#b5bac1]"><IconChevronRight /></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <div className="rounded-xl border border-[#5865f2]/28 bg-[#2b2d31] px-3.5 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">Selected reason</div>
                    <div className="mt-1 text-[14px] font-medium text-[#f2f3f5]">{selectedOption.label}</div>
                  </div>

                  <label className="mt-4 block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#949ba4]">
                    {selectedOption.detailTitle}
                  </label>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={selectedOption.detailPlaceholder}
                    rows={5}
                    className="mt-2 w-full resize-none rounded-xl border border-white/8 bg-[#1e1f22] px-3.5 py-3 text-[14px] leading-5 text-[#f2f3f5] outline-none transition-colors placeholder:text-[#878d96] focus:border-[#5865f2]"
                  />

                  <div className="mt-2 text-[12px] leading-5 text-[#949ba4]">
                    Include anything moderators should know. The message itself is attached to this report.
                  </div>

                  {error ? (
                    <div className="mt-3 rounded-lg border border-[#da373c]/30 bg-[#da373c]/10 px-3 py-2 text-[12px] text-[#ffb7b9]">
                      {error}
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={submitting}
                      className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#b5bac1] transition-colors hover:bg-white/6 hover:text-[#f2f3f5] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="rounded-lg bg-[#5865f2] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
