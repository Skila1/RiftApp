import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { DiscordTemplatePreview } from '../../types';
import { useHubStore } from '../../stores/hubStore';
import ModalOverlay from '../shared/ModalOverlay';
import ModalCloseButton from '../shared/ModalCloseButton';

type ServerFlowStep = 'choice' | 'create' | 'join' | 'import';

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

function extractDiscordTemplateCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const directMatch = trimmed.match(/(?:discord\.new|discord(?:app)?\.com\/template|discord\.com\/template|\/template\/)([A-Za-z0-9-]+)/i);
  if (directMatch?.[1]) return directMatch[1];

  if (/^[A-Za-z0-9-]+$/.test(trimmed)) return trimmed;

  try {
    const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.toLowerCase() === 'discord.new' && parts[0]) {
      return parts[0];
    }
    const templateIndex = parts.findIndex((part) => part.toLowerCase() === 'template');
    if (templateIndex >= 0 && parts[templateIndex + 1]) {
      return parts[templateIndex + 1];
    }
  } catch {
    return '';
  }

  return '';
}

function ChoiceCard({
  title,
  description,
  icon,
  wide = false,
  onClick,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  wide?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-[10px] border border-[#353944] bg-[#23272f] text-left transition-all duration-150 hover:border-[#4c5363] hover:bg-[#282d36] ${wide ? 'col-span-2 flex items-center gap-3 px-4 py-3' : 'flex min-h-[104px] flex-col items-center justify-center px-3 py-4 text-center'}`}
    >
      <div className={`flex items-center justify-center rounded-full bg-[#3f5ae0] text-white shadow-[0_10px_26px_rgba(63,90,224,0.28)] ${wide ? 'h-10 w-10 flex-shrink-0' : 'mb-3 h-11 w-11'}`}>
        {icon}
      </div>
      <div className={wide ? 'min-w-0 flex-1' : 'min-w-0'}>
        <p className="text-[14px] font-semibold text-white">{title}</p>
        {description && <p className={`mt-1 text-[11px] leading-snug text-[#9fa6b2] ${wide ? '' : 'px-2'}`}>{description}</p>}
      </div>
    </button>
  );
}

function TemplateStat({ label }: { label: string }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#cfd5df]">{label}</span>;
}

function TemplateChannelIcon({ type }: { type: 'text' | 'voice' }) {
  if (type === 'voice') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b8bec8]">
        <path d="M14 8.5a5 5 0 0 1 0 7" />
        <path d="M17 5.5a9 9 0 0 1 0 13" />
        <path d="M5 9a3 3 0 0 1 3-3h2l4-3v18l-4-3H8a3 3 0 0 1-3-3V9z" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#b8bec8]">
      <path d="M5 9h14" />
      <path d="M5 15h14" />
      <path d="M10 3L8 21" />
      <path d="M16 3l-2 18" />
    </svg>
  );
}

export default function AddServerModal({ onClose }: Props) {
  const createHub = useHubStore((s) => s.createHub);
  const loadHubs = useHubStore((s) => s.loadHubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  const [step, setStep] = useState<ServerFlowStep>('choice');
  const [serverName, setServerName] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [templateInput, setTemplateInput] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [previewingTemplate, setPreviewingTemplate] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<DiscordTemplatePreview | null>(null);

  const createInputRef = useRef<HTMLInputElement>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const previewRequestRef = useRef(0);

  const busy = creating || joining || importingTemplate;
  const templateCode = useMemo(() => extractDiscordTemplateCode(templateInput), [templateInput]);

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
      case 'import':
        return {
          title: 'Import Discord Template',
          description: 'Paste a Discord template link and Rift will recreate its channels, categories, and roles.',
        };
      default:
        return {
          title: 'Add a Server',
          description: 'Create a new server, join an existing one, or import a Discord template.',
        };
    }
  }, [step]);

  useEffect(() => {
    if (step === 'create') {
      window.requestAnimationFrame(() => createInputRef.current?.focus());
    }
    if (step === 'join') {
      window.requestAnimationFrame(() => joinInputRef.current?.focus());
    }
    if (step === 'import') {
      window.requestAnimationFrame(() => templateInputRef.current?.focus());
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'import') return undefined;

    const code = templateCode;
    if (!code || code.length < 4) {
      setPreviewingTemplate(false);
      setTemplatePreview(null);
      return undefined;
    }

    const requestId = ++previewRequestRef.current;
    const timer = window.setTimeout(async () => {
      setPreviewingTemplate(true);
      try {
        const preview = await api.getDiscordTemplatePreview(templateInput);
        if (previewRequestRef.current !== requestId) return;
        setTemplatePreview(preview);
        setTemplateError(null);
      } catch (err: unknown) {
        if (previewRequestRef.current !== requestId) return;
        setTemplatePreview(null);
        setTemplateError(err instanceof Error ? err.message : 'Unable to load template preview');
      } finally {
        if (previewRequestRef.current === requestId) {
          setPreviewingTemplate(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [step, templateCode, templateInput]);

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

  const handleImportTemplate = async () => {
    if (!templateCode || importingTemplate) return;
    setTemplateError(null);
    setImportingTemplate(true);
    try {
      const result = await api.importDiscordTemplate(templateInput);
      await loadHubs();
      onClose();
      await setActiveHub(result.hub.id);
    } catch (err: unknown) {
      setTemplateError(err instanceof Error ? err.message : 'Unable to import Discord template');
    } finally {
      setImportingTemplate(false);
    }
  };

  const modalWidthClass = step === 'choice'
    ? 'max-w-[350px]'
    : step === 'import'
      ? 'max-w-[560px]'
      : 'max-w-[440px]';

  return (
    <ModalOverlay isOpen onClose={handleBackdropClose} backdropClose={!busy} zIndex={300}>
      <div className={`modal-content w-full ${modalWidthClass} rounded-[12px] border border-[#2f3440] bg-[#1f2228] shadow-[0_28px_90px_rgba(0,0,0,0.48)]`}>
        <div className="px-6 pb-5 pt-6">
          <div className="mb-1 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[30px] font-black tracking-tight text-white">{stepCopy.title}</h2>
              <p className="mt-1 text-sm text-[#9fa6b2]">{stepCopy.description}</p>
            </div>
            <ModalCloseButton onClick={handleBackdropClose} disabled={busy} />
          </div>

          {step === 'choice' && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <ChoiceCard
                title="Create a Server"
                description="Start fresh"
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
                description="Use an invite"
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
              <ChoiceCard
                title="Import Discord Template"
                description="Copy categories, channels, and roles from a Discord template link."
                wide
                onClick={() => {
                  setTemplateError(null);
                  setStep('import');
                }}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 19h14" />
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
                placeholder="Enter server name"
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
                placeholder="Enter invite link or code"
                maxLength={256}
                className="settings-input text-base"
              />
              <div className="mt-3 space-y-1 text-xs text-riftapp-text-dim">
                <p>Invites can look like:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-md bg-riftapp-bg px-2 py-1 text-riftapp-text-muted">htKzmak</span>
                  <span className="rounded-md bg-riftapp-bg px-2 py-1 text-riftapp-text-muted">riftapp.io/invite/htKzmak</span>
                </div>
              </div>
              {joinError && <p className="mt-3 text-sm text-riftapp-danger">{joinError}</p>}
            </div>
          )}

          {step === 'import' && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[#b1b8c3]">
                  Template Link
                </label>
                <input
                  ref={templateInputRef}
                  type="text"
                  value={templateInput}
                  onChange={(event) => {
                    setTemplateInput(event.target.value);
                    if (templateError) setTemplateError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleImportTemplate();
                  }}
                  placeholder="discord.new/hgM48av5Q69A"
                  maxLength={256}
                  className="settings-input text-base"
                />
                <p className="mt-2 text-xs text-[#959daa]">
                  Rift imports the server structure, categories, channels, and global role permissions from a Discord template.
                </p>
              </div>

              {previewingTemplate && (
                <div className="rounded-[12px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#cfd5df]">
                  Loading template preview...
                </div>
              )}

              {templatePreview && (
                <div className="rounded-[14px] border border-white/10 bg-[#23272f] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f98a6]">Discord Template</p>
                      <h3 className="mt-1 truncate text-[20px] font-bold text-white">{templatePreview.suggested_hub_name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#aab2be]">
                        {templatePreview.description || `Source: ${templatePreview.source_guild_name}`}
                      </p>
                    </div>
                    <div className="rounded-full border border-[#4a5160] bg-[#1b1e24] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c4cbda]">
                      {templatePreview.code}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <TemplateStat label={`${templatePreview.category_count} categories`} />
                    <TemplateStat label={`${templatePreview.text_channel_count} text`} />
                    <TemplateStat label={`${templatePreview.voice_channel_count} voice`} />
                    <TemplateStat label={`${templatePreview.role_count} roles`} />
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
                    <div className="min-w-0 rounded-[12px] border border-white/6 bg-black/10 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f98a6]">Channels</p>
                      <div className="max-h-[220px] space-y-3 overflow-y-auto pr-1">
                        {templatePreview.uncategorized_channels.length > 0 && (
                          <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f7785]">Uncategorized</p>
                            <div className="space-y-1.5">
                              {templatePreview.uncategorized_channels.map((channel) => (
                                <div key={`uncat-${channel.type}-${channel.name}`} className="flex items-center gap-2 rounded-[8px] bg-white/[0.03] px-2.5 py-2 text-sm text-[#d7dce5]">
                                  <TemplateChannelIcon type={channel.type} />
                                  <span className="truncate">{channel.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {templatePreview.categories.map((category) => (
                          <div key={category.name}>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f7785]">{category.name}</p>
                            <div className="space-y-1.5">
                              {category.channels.length === 0 ? (
                                <div className="rounded-[8px] bg-white/[0.03] px-2.5 py-2 text-sm text-[#8f98a6]">No supported channels in this category.</div>
                              ) : (
                                category.channels.map((channel) => (
                                  <div key={`${category.name}-${channel.type}-${channel.name}`} className="flex items-center gap-2 rounded-[8px] bg-white/[0.03] px-2.5 py-2 text-sm text-[#d7dce5]">
                                    <TemplateChannelIcon type={channel.type} />
                                    <span className="truncate">{channel.name}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[12px] border border-white/6 bg-black/10 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f98a6]">Roles</p>
                      <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                        {templatePreview.roles.length === 0 ? (
                          <div className="rounded-[8px] bg-white/[0.03] px-2.5 py-2 text-sm text-[#8f98a6]">No custom roles in this template.</div>
                        ) : (
                          templatePreview.roles.map((role) => (
                            <div key={role.name} className="flex items-center gap-2 rounded-[8px] bg-white/[0.03] px-2.5 py-2 text-sm text-[#d7dce5]">
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
                              <span className="truncate">{role.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {templatePreview.unsupported_features && templatePreview.unsupported_features.length > 0 && (
                    <div className="mt-4 rounded-[12px] border border-[#6d5d21] bg-[#302812] px-3 py-3 text-sm text-[#e2d5a6]">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f0dfa6]">Import Notes</p>
                      <div className="space-y-1.5">
                        {templatePreview.unsupported_features.map((feature) => (
                          <p key={feature}>{feature}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {templateError && <p className="text-sm text-riftapp-danger">{templateError}</p>}
            </div>
          )}
        </div>

        {step !== 'choice' && (
          <div className="flex items-center justify-between border-t border-white/5 bg-[#1a1d23] px-6 py-4">
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                setCreateError(null);
                setJoinError(null);
                setTemplateError(null);
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
            ) : step === 'join' ? (
              <button type="button" onClick={() => void handleJoin()} disabled={!inviteInput.trim() || joining} className="btn-primary px-5 py-2.5">
                {joining ? 'Joining...' : 'Join Server'}
              </button>
            ) : (
              <button type="button" onClick={() => void handleImportTemplate()} disabled={!templateCode || importingTemplate || previewingTemplate} className="btn-primary px-5 py-2.5">
                {importingTemplate ? 'Importing...' : 'Import Template'}
              </button>
            )}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}