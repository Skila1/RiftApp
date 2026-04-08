import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string | null;
  variant?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  children?: React.ReactNode;
  confirmDisabled?: boolean;
  allowBackdropClose?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
  children,
  confirmDisabled = false,
  allowBackdropClose,
}: ConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const canBackdropClose = useMemo(() => allowBackdropClose ?? variant !== 'danger', [allowBackdropClose, variant]);

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter' && !loading && !confirmDisabled) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          void onConfirm();
          return;
        }
      }
      trapFocus(e);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      focusable?.[0]?.focus();
    });
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [confirmDisabled, isOpen, loading, onCancel, onConfirm, trapFocus]);

  if (!isOpen) return null;

  const confirmClass = variant === 'danger'
    ? 'bg-[#da373c] hover:bg-[#a12828]'
    : 'bg-[#5865f2] hover:bg-[#4752c4]';

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-fade-in"
      onClick={() => {
        if (canBackdropClose && !loading) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        className="w-[440px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-riftapp-border/60 bg-riftapp-panel shadow-modal animate-scale-in outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-[18px] font-bold text-white">{title}</h2>
          <div className="mt-1 text-[14px] leading-relaxed text-riftapp-text-muted">{description}</div>
        </div>

        {children && <div className="px-5 pb-4">{children}</div>}

        <div className="flex items-center justify-end gap-3 border-t border-riftapp-border/60 bg-riftapp-content-elevated px-5 py-4">
          {cancelText ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2.5 text-[13px] font-medium text-riftapp-text hover:underline disabled:opacity-50"
            >
              {cancelText}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading || confirmDisabled}
            className={`px-5 py-2.5 rounded-[4px] text-white text-[13px] font-medium active:scale-95 transition-all disabled:opacity-50 ${confirmClass}`}
          >
            {loading ? 'Working...' : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}