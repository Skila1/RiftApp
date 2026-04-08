import type { ReactNode } from 'react';
import ModalCloseButton from '../shared/ModalCloseButton';
import { HS, hsTw } from './hubSettingsTokens';

export function SettingsDivider() {
  return <div className="my-5 h-px bg-riftapp-border/60" role="separator" />;
}

export function InfoBanner({ children, action }: { children: ReactNode; action?: { label: string; onClick?: () => void } }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#0068da]/40 bg-[#0068da]/12 px-4 py-3 text-[13px] text-riftapp-text">
      <div className="min-w-0">{children}</div>
      {action && (
        <button type="button" onClick={action.onClick} className="text-[#00a8fc] font-medium hover:underline shrink-0">
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] text-[#f2f3f5] font-medium">{label}</span>
          {badge && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#5865f2] text-white">{badge}</span>
          )}
        </div>
        {description && <p className="mt-1 text-[13px] leading-snug text-riftapp-text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${
          checked ? 'bg-[#5865f2]' : 'bg-[#4e5058]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  );
}

export function RadioRow({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer group">
      <span
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          checked ? 'border-[#5865f2]' : 'border-[#4e5058] group-hover:border-[#6d6f78]'
        }`}
      >
        {checked && <span className="w-2.5 h-2.5 rounded-full bg-[#5865f2]" />}
      </span>
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      <span className="text-[15px] text-riftapp-text">{label}</span>
    </label>
  );
}

export function SelectField({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label?: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      {(label || description) && (
        <div>
          {label ? <p className="text-[12px] font-bold uppercase tracking-wider text-riftapp-text-muted">{label}</p> : null}
          {description && <p className="mt-1 text-[13px] text-riftapp-text-dim">{description}</p>}
        </div>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-md cursor-pointer appearance-none rounded-[4px] border border-riftapp-border/60 bg-riftapp-content-elevated px-3 py-2.5 text-[13px] text-riftapp-text focus:outline-none focus:ring-1 focus:ring-[#5865f2]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23949ba4' viewBox='0 0 24 24'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CloseButtonEsc({ onClose }: { onClose: () => void }) {
  return (
    <ModalCloseButton onClick={onClose} title="Close settings" ariaLabel="Close settings" />
  );
}

export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <h1 className={hsTw.title}>{title}</h1>
      {right}
    </div>
  );
}

export function UnlockBoostingButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-[14px] font-semibold text-white bg-[#2b2d31] border-2 border-transparent bg-clip-padding relative
        shadow-[0_0_0_2px_transparent] hover:opacity-95 transition-opacity
        before:absolute before:inset-[-2px] before:rounded-lg before:p-[2px] before:bg-gradient-to-r before:from-[#5865f2] before:via-[#eb459e] before:to-[#fee75c] before:-z-10"
      style={{ boxShadow: '0 0 20px rgba(88,101,242,0.35)' }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-[#faa61a]">
        <path d="M12 2L9 9l-7 1 7 1 3 7 3-7 7-1-7-1-3-7z" />
      </svg>
      Unlock with Boosting
    </button>
  );
}

export function LevelBadge({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#5865f2]/25 text-[#949ba4] border border-[#5865f2]/40">
      LVL {level}
    </span>
  );
}

export function EmptyStateBlock({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-2xl border border-riftapp-border/60 bg-riftapp-panel opacity-90">
        <div className="grid grid-cols-3 gap-1 text-lg grayscale opacity-60 select-none">😀👻👑😈💀🎭</div>
      </div>
      <p className="mb-2 text-[15px] font-bold uppercase tracking-wide text-riftapp-text-dim">{title}</p>
      <p className="mb-6 max-w-sm text-[13px] leading-relaxed text-riftapp-text-dim">{subtitle}</p>
      {action}
    </div>
  );
}

export function PromoBannerBoosted({ onBoost, onLearn }: { onBoost?: () => void; onLearn?: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden bg-gradient-to-br from-[#5865f2] via-[#7289da] to-[#9b59b6] p-8 text-center relative">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 0%, transparent 50%)' }} />
      <h3 className="text-[22px] font-bold text-white mb-2 relative">Get Boosted</h3>
      <p className="text-[14px] text-white/90 mb-6 max-w-lg mx-auto relative">
        Unlock more sticker slots and perks by boosting this server.
      </p>
      <div className="flex flex-wrap justify-center gap-3 relative">
        <button type="button" onClick={onBoost} className="px-6 py-2.5 rounded-md bg-white text-[#5865f2] text-[14px] font-semibold hover:bg-white/95">
          Boost Server
        </button>
        <button type="button" onClick={onLearn} className="px-6 py-2.5 rounded-md border-2 border-white/80 text-white text-[14px] font-semibold hover:bg-white/10">
          Learn More
        </button>
      </div>
    </div>
  );
}

export { HS };
