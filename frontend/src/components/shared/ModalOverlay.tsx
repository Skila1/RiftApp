import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface ModalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Centre the content (default). Set false for full-screen layouts like User Settings. */
  center?: boolean;
  /** Allow clicking the backdrop to close. Default true. */
  backdropClose?: boolean;
  /** z-index layer. Default 200. */
  zIndex?: number;
  /** Extra classes on the backdrop element. */
  className?: string;
  /** Extra classes on the animated content wrapper. */
  contentClassName?: string;
}

/**
 * Shared modal overlay with:
 *  - dark semi-transparent backdrop  (rgba(0,0,0,0.6) + blur)
 *  - scroll-lock on <body>
 *  - click-backdrop-to-close
 *  - Escape to close
 *  - fade + scale entrance/exit animations
 */
export default function ModalOverlay({
  isOpen,
  onClose,
  children,
  center = true,
  backdropClose = true,
  zIndex = 200,
  className,
  contentClassName,
}: ModalOverlayProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (backdropClose && e.target === backdropRef.current) {
        onClose();
      }
    },
    [backdropClose, onClose],
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={backdropRef}
          className={`fixed inset-0 ${center ? 'flex items-center justify-center' : ''} ${className ?? ''}`}
          style={{
            zIndex,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          role="dialog"
          aria-modal="true"
          onClick={handleBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`${center ? '' : 'h-full w-full'} ${contentClassName ?? ''}`.trim()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
