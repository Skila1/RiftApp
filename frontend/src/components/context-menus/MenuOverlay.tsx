import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

function clampMenuPosition(x: number, y: number, w: number, h: number) {
  const m = 8;
  let nx = Math.min(x, window.innerWidth - w - m);
  let ny = Math.min(y, window.innerHeight - h - m);
  nx = Math.max(m, nx);
  ny = Math.max(m, ny);
  return { x: nx, y: ny };
}

export function MenuOverlay({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    setPos({ x, y });
  }, [x, y]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(clampMenuPosition(x, y, r.width, r.height));
  }, [x, y]);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[240]"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={wrapRef}
        className="fixed z-[241] min-w-[200px] animate-scale-in"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function menuDivider() {
  return <div className="mx-2 my-1 h-px bg-white/[0.06]" />;
}
