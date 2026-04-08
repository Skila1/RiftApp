interface ModalCloseButtonProps {
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  variant?: 'default' | 'overlay';
  className?: string;
}

const sizeClassMap = {
  sm: {
    button: 'h-7 w-7',
    icon: 14,
  },
  md: {
    button: 'h-9 w-9',
    icon: 16,
  },
} as const;

const variantClassMap = {
  default: 'border border-riftapp-border/70 bg-riftapp-panel/60 text-riftapp-text-muted hover:border-riftapp-text-dim hover:bg-riftapp-danger/10 hover:text-riftapp-text',
  overlay: 'border border-riftapp-border/70 bg-riftapp-bg/85 text-riftapp-text-muted hover:border-riftapp-border-light hover:bg-riftapp-content-elevated hover:text-riftapp-text',
} as const;

export default function ModalCloseButton({
  onClick,
  title = 'Close',
  ariaLabel = 'Close',
  disabled = false,
  size = 'md',
  variant = 'default',
  className,
}: ModalCloseButtonProps) {
  const sizeClasses = sizeClassMap[size];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center justify-center rounded-full transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        sizeClasses.button,
        variantClassMap[variant],
        className,
      ].filter(Boolean).join(' ')}
    >
      <svg
        width={sizeClasses.icon}
        height={sizeClasses.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}