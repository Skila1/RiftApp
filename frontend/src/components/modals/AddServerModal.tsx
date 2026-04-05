import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import { useHubStore } from '../../stores/hubStore';

type ServerFlowStep = 'choice' | 'create' | 'join';

interface Props {
  onClose: () => void;
}

function extractInviteCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const directMatch = trimmed.match(/(?:discord\.gg|discord(?:app)?\.com\/invite|riftapp\.io\/invite|\/invite\/)([A-Za-z0-9-]+)/i);
  if (directMatch?.[1]) return directMatch[1];

  try {
    const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return trimmed;

    const inviteIndex = parts.findIndex((part) => part.toLowerCase() === 'invite');
    if (inviteIndex >= 0 && parts[inviteIndex + 1]) {
      return parts[inviteIndex + 1];
    }

    return parts[parts.length - 1];
  } catch {
    return trimmed;
  }
}

function ChoiceCard({
  title,
  description,
  accentClass,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  accentClass: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-riftapp-border/50 bg-riftapp-panel/60 px-4 py-3 text-left transition-all duration-150 hover:border-riftapp-border hover:bg-riftapp-panel"
    >
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${accentClass}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-riftapp-text">{title}</p>
        <p className="mt-1 text-xs leading-snug text-riftapp-text-dim">{description}</p>
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="flex-shrink-0 text-riftapp-text-dim transition-transform duration-150 group-hover:translate-x-0.5"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

export default function AddServerModal({ onClose }: Props) {
  const createHub = useHubStore((s) => s.createHub);
  const loadHubs = useHubStore((s) => s.loadHubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  const [step, setStep] = useState<ServerFlowStep>('choice');
  const [serverName, setServerName] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);

  const busy = creating || joining;

  const stepCopy = useMemo(() => {
    switch (step) {
      case 'create':
        return {
          title: 'Create a Server',
          description: 'Give your server a name. You can change it later.',
        };
      case 'join':
        return {
          title: 'Join a Server',
          description: 'Enter an invite link or code to join an existing server.',
        };
      default:
        return {
          title: 'Add a Server',
          description: 'Create a new server or join one with an invite.',
        };
    }
  }, [step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  useEffect(() => {
    if (step === 'create') {
      window.requestAnimationFrame(() => createInputRef.current?.focus());
    }
    if (step === 'join') {
      window.requestAnimationFrame(() => joinInputRef.current?.focus());
    }
  }, [step]);

  const handleBackdropClose = () => {
    if (!busy) onClose();
  };

  const handleCreate = async () => {
    const trimmed = serverName.trim();
    if (!trimmed || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      const hub = await createHub(trimmed);
      onClose();
      await setActiveHub(hub.id);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create server');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const code = extractInviteCode(inviteInput);
    if (!code || joining) return;
    setJoinError(null);
    setJoining(true);
    try {
      const result = await api.joinInvite(code);
      await loadHubs();
      onClose();
      await setActiveHub(result.hub.id);
    } catch (err: unknown) {
      setJoinError(err instanceof Error ? err.message : 'Invalid invite link');
    } finally {
      setJoining(false);
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(event) => {
        if (event.target === backdropRef.current) handleBackdropClose();
      }}
      className="modal-backdrop"
    >
      <div className="modal-content w-full max-w-[440px] animate-scale-in" onClick={(event) => event.stopPropagation()}>
        <div className="px-6 pb-5 pt-6">
          <div className="mb-1 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[28px] font-black tracking-tight text-riftapp-text">{stepCopy.title}</h2>
              <p className="mt-1 text-sm text-riftapp-text-dim">{stepCopy.description}</p>
            </div>
            <button
              type="button"
              onClick={handleBackdropClose}
              disabled={busy}
              className="rounded-full p-1.5 text-riftapp-text-dim transition-colors hover:bg-riftapp-panel hover:text-riftapp-text disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {step === 'choice' && (
            <div className="mt-6 space-y-3">
              <ChoiceCard
                title="Create a Server"
                description="Start fresh with a name and a default General channel."
                accentClass="bg-riftapp-success/15 text-riftapp-success"
                onClick={() => {
                  setCreateError(null);
                  setStep('create');
                }}
                icon={
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                }
              />
              <ChoiceCard
                title="Join a Server"
                description="Paste an invite link or code and jump straight in."
                accentClass="bg-riftapp-accent/15 text-riftapp-accent"
                onClick={() => {
                  setJoinError(null);
                  setStep('join');
                }}
                icon={
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                }
              />
            </div>
          )}

          {step === 'create' && (
            <div className="mt-6">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-riftapp-text-dim">
                Server Name
              </label>
              <input
                ref={createInputRef}
                type="text"
                value={serverName}
                onChange={(event) => {
                  setServerName(event.target.value);
                  if (createError) setCreateError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreate();
                }}
                placeholder="Ape Enclosure"
                maxLength={100}
                className="settings-input text-base"
              />
              <p className="mt-2 text-xs text-riftapp-text-dim">A General text channel will be created automatically.</p>
              {createError && <p className="mt-3 text-sm text-riftapp-danger">{createError}</p>}
            </div>
          )}

          {step === 'join' && (
            <div className="mt-6">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-riftapp-text-dim">
                Invite Link
              </label>
              <input
                ref={joinInputRef}
                type="text"
                value={inviteInput}
                onChange={(event) => {
                  setInviteInput(event.target.value);
                  if (joinError) setJoinError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleJoin();
                }}
                placeholder="https://riftapp.io/invite/htKzmak"
                maxLength={256}
                className="settings-input text-base"
              />
              <div className="mt-3 space-y-1 text-xs text-riftapp-text-dim">
                <p>Invites can look like:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-riftapp-bg px-2 py-1 text-riftapp-text-muted">htKzmak</span>
                  <span className="rounded-md bg-riftapp-bg px-2 py-1 text-riftapp-text-muted">discord.gg/htKzmak</span>
                  <span className="rounded-md bg-riftapp-bg px-2 py-1 text-riftapp-text-muted">riftapp.io/invite/htKzmak</span>
                </div>
              </div>
              {joinError && <p className="mt-3 text-sm text-riftapp-danger">{joinError}</p>}
            </div>
          )}
        </div>

        {step !== 'choice' && (
          <div className="flex items-center justify-between bg-riftapp-panel/55 px-6 py-4">
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                setCreateError(null);
                setJoinError(null);
                setStep('choice');
              }}
              className="btn-ghost px-3 py-2"
              disabled={busy}
            >
              Back
            </button>
            {step === 'create' ? (
              <button type="button" onClick={() => void handleCreate()} disabled={!serverName.trim() || creating} className="btn-primary px-5 py-2.5">
                {creating ? 'Creating...' : 'Create Server'}
              </button>
            ) : (
              <button type="button" onClick={() => void handleJoin()} disabled={!inviteInput.trim() || joining} className="btn-primary px-5 py-2.5">
                {joining ? 'Joining...' : 'Join Server'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}