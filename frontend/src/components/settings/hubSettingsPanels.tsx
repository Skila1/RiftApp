import { useState, useEffect } from 'react';
import {
  SettingsDivider,
  InfoBanner,
  ToggleRow,
  RadioRow,
  SelectField,
  UnlockBoostingButton,
  LevelBadge,
  PromoBannerBoosted,
} from './hubSettingsUi';
import { hsTw } from './hubSettingsTokens';
import { api } from '../../api/client';

const BADGE_ICONS = ['🍃', '⚔️', '❤️', '🔥', '💧', '💀', '🌙', '⚡', '✨', '🍄'];
const SWORD_COLORS = ['#eb459e', '#fee75c', '#57f287', '#ed4245', '#5865f2', '#99aab5', '#ffffff'];

export function ServerTagPanel() {
  const [tagName, setTagName] = useState('WUMP');
  const [showAllBadges, setShowAllBadges] = useState(false);
  return (
    <div className="max-w-3xl">
      <h1 className={hsTw.title}>Server Tag</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-4 max-w-2xl`}>
        Members can display a tag next to their name in this server. People may view your Server Profile from the tag.
      </p>
      <InfoBanner action={{ label: 'Edit Setting' }}>
        Your Server Profile is private. Users will not be able to see it from a Server Tag.
      </InfoBanner>
      <div className="mt-6 mb-6">
        <UnlockBoostingButton />
      </div>
      <SettingsDivider />
      <div className="mb-4">
        <p className={hsTw.sectionTitle + ' mb-2'}>Choose Name</p>
        <input
          value={tagName}
          onChange={(e) => setTagName(e.target.value.slice(0, 4).replace(/[^a-zA-Z0-9]/g, ''))}
          className={hsTw.input + ' max-w-xs'}
          placeholder="WUMP"
        />
        <p className="text-[12px] text-[#949ba4] mt-1.5">You may use max 4 characters, alphabet and numbers.</p>
      </div>
      <InfoBanner action={{ label: 'Learn more' }}>
        Updating your Server Tag will require all of your members to manually reapply the tag to their profile.
      </InfoBanner>
      <div className="mt-6">
        <p className={hsTw.sectionTitle + ' mb-3'}>Choose Badge</p>
        <div className="flex flex-wrap gap-2 max-w-md">
          {(showAllBadges ? BADGE_ICONS : BADGE_ICONS.slice(0, 6)).map((c) => (
            <button
              key={c}
              type="button"
              className="w-11 h-11 rounded-lg bg-[#2b2d31] border border-[#1e1f22] text-xl hover:border-[#5865f2] transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setShowAllBadges((v) => !v)} className="text-[13px] text-[#00a8fc] mt-3 hover:underline">
          {showAllBadges ? 'Show fewer badges' : 'Show all badges'}
        </button>
      </div>
      <div className="mt-6">
        <p className={hsTw.sectionTitle + ' mb-3'}>Choose Color</p>
        <div className="flex flex-wrap gap-2">
          {SWORD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="w-11 h-11 rounded-lg border-2 border-[#1e1f22] flex items-center justify-center hover:border-white/30"
              style={{ backgroundColor: c === '#ffffff' ? '#4e5058' : c }}
              aria-label={`Color ${c}`}
            >
              <span className="text-lg" style={{ color: c === '#ffffff' ? '#fff' : 'rgba(255,255,255,0.9)' }}>
                ⚔️
              </span>
            </button>
          ))}
          <label className="w-11 h-11 rounded-lg border-2 border-dashed border-[#4e5058] flex items-center justify-center cursor-pointer hover:border-[#5865f2]">
            <input type="color" className="sr-only" title="Custom color" />
            <span className="text-[#b5bac1] text-lg">🎨</span>
          </label>
        </div>
      </div>
      <div className="mt-8 p-4 rounded-lg bg-[#111214] border border-[#1e1f22] max-w-sm ml-auto">
        <p className="text-[11px] text-[#949ba4] uppercase mb-2">Preview</p>
        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-white font-medium">Lily</span>
          <span className="px-1.5 py-0.5 rounded bg-[#4e5058] text-[12px] text-[#dbdee1]">⚔️ {tagName || 'TAG'}</span>
        </div>
        <p className="text-[13px] text-[#b5bac1] mt-2">check out my tag!</p>
      </div>
    </div>
  );
}

export function EngagementPanel() {
  const [t1, setT1] = useState(true);
  const [t2, setT2] = useState(true);
  const [t3, setT3] = useState(true);
  const [t4, setT4] = useState(true);
  const [activity, setActivity] = useState(true);
  const [notif, setNotif] = useState<'all' | 'mentions'>('all');
  return (
    <div className="max-w-2xl">
      <h1 className={hsTw.title}>Engagement</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-6`}>Manage settings that help keep your server active.</p>
      <div>
        <h2 className="text-[16px] font-semibold text-white mb-1">System Messages</h2>
        <p className="text-[13px] text-[#949ba4] mb-3">Configure system event messages sent to your server.</p>
        <ToggleRow label="Send a random welcome message when someone joins this server." checked={t1} onChange={setT1} />
        <ToggleRow label="Prompt members to reply to welcome messages with a sticker." checked={t2} onChange={setT2} />
        <ToggleRow label="Send a message when someone boosts this server." checked={t3} onChange={setT3} />
        <ToggleRow label="Send helpful tips for server setup." checked={t4} onChange={setT4} />
        <div className="mt-4">
          <SelectField
            label="System Messages Channel"
            description="This is the channel we send system event messages to."
            value="none"
            onChange={() => {}}
            options={[
              { value: 'none', label: 'No System Messages' },
              { value: 'general', label: '# general' },
            ]}
          />
        </div>
      </div>
      <SettingsDivider />
      <div>
        <h2 className="text-[16px] font-semibold text-white mb-1">Activity Feed Settings</h2>
        <p className="text-[13px] text-[#949ba4] mb-3">Shows a feed of activity from games and connected apps in this server.</p>
        <ToggleRow label="Display Activity Feed in this server" checked={activity} onChange={setActivity} />
      </div>
      <SettingsDivider />
      <div>
        <h2 className="text-[16px] font-semibold text-white mb-1">Default Notification Settings</h2>
        <p className="text-[13px] text-[#b5bac1] mb-4">
          This will determine whether members who have not explicitly set their notification settings receive a notification for every message sent in this server or not.
        </p>
        <RadioRow name="notif" label="All Messages" checked={notif === 'all'} onChange={() => setNotif('all')} />
        <RadioRow name="notif" label="Only @mentions" checked={notif === 'mentions'} onChange={() => setNotif('mentions')} />
        <p className="text-[12px] text-[#949ba4] mt-3">We highly recommend setting this to only @mentions for a Community Server.</p>
      </div>
      <SettingsDivider />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <SelectField
          label="Inactive Channel"
          value="none"
          onChange={() => {}}
          options={[
            { value: 'none', label: 'No Inactive Channel' },
            { value: 'afk', label: '# afk' },
          ]}
        />
        <SelectField
          label="Inactive Timeout"
          value="5"
          onChange={() => {}}
          options={[
            { value: '5', label: '5 minutes' },
            { value: '15', label: '15 minutes' },
          ]}
        />
      </div>
      <p className="text-[12px] text-[#949ba4] mt-2">
        Automatically move members to this channel and mute them when they have been idle for longer than the inactive timeout. This does not affect browsers.
      </p>
    </div>
  );
}

export function BoostPerksPanel() {
  const [progress, setProgress] = useState(false);
  return (
    <div className="max-w-3xl">
      <h1 className={hsTw.title}>Boost Perks</h1>
      <SettingsDivider />
      <div className="flex flex-col lg:flex-row gap-6 items-start py-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-semibold text-white mb-1">Show Boost progress bar</h2>
          <p className="text-[13px] text-[#b5bac1]">
            Servers with the Boost progress bar enabled get more Boosts. This progress bar will display in your channel list, attached to your server name (or server banner if you have one set).
          </p>
        </div>
        <div className="flex items-start gap-4 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={progress}
            onClick={() => setProgress(!progress)}
            className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${progress ? 'bg-[#5865f2]' : 'bg-[#4e5058]'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${progress ? 'translate-x-4' : ''}`} />
          </button>
          <div className="w-40 h-24 rounded-lg bg-[#2b2d31] border border-[#1e1f22] flex flex-col overflow-hidden text-[8px] text-[#949ba4] p-1">
            <div className="h-4 bg-[#5865f2]/40 rounded-sm mb-1" />
            <div className="flex-1 flex gap-0.5">
              <div className="w-1/3 space-y-0.5">
                <div className="h-1 bg-[#4e5058] rounded" />
                <div className="h-1 bg-[#4e5058] rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <SettingsDivider />
      {[
        { title: 'Server Banner Background', level: 2 as const },
        { title: 'Server Invite Background', level: 1 as const },
        { title: 'Custom Invite Link', level: 3 as const },
      ].map((row) => (
        <div key={row.title} className="py-6 flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-[16px] font-semibold text-white">{row.title}</h2>
              <LevelBadge level={row.level} />
            </div>
            <p className="text-[13px] text-[#b5bac1] mb-4">
              Upload a custom image for this perk.{' '}
              <button type="button" className="text-[#00a8fc] hover:underline">
                Learn more
              </button>
            </p>
            <UnlockBoostingButton />
          </div>
          <div className="w-full lg:w-56 h-32 rounded-lg bg-[#2b2d31] border border-[#1e1f22] flex items-center justify-center relative shrink-0">
            <button type="button" className="absolute top-2 right-2 w-7 h-7 rounded bg-[#1e1f22] text-[#949ba4] flex items-center justify-center text-lg">
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmojiPanelShell({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <h1 className={hsTw.title}>Emoji</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-4 max-w-2xl`}>
        Add up to 50 custom emoji that anyone can use in this server. Animated GIF emoji may be used by Nitro members.
      </p>
      {children}
    </div>
  );
}

export function StickersPanelShell({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <h1 className={hsTw.title}>Stickers</h1>
      <div className="mb-6 mt-4">
        <PromoBannerBoosted />
      </div>
      <SettingsDivider />
      <div className="flex gap-6 py-4">
        <div className="flex flex-col items-center gap-3 w-8 shrink-0 pt-1">
          <div className="w-3 h-3 rounded-full bg-[#eb459e]" />
          <div className="w-0.5 flex-1 min-h-[48px] bg-[#3f4147]" />
          <div className="w-4 h-4 rounded-full bg-[#eb459e] flex items-center justify-center text-white text-[10px] font-bold">✓</div>
          <div className="w-0.5 flex-1 min-h-[48px] bg-[#3f4147]" />
          <div className="w-3 h-3 rounded-full bg-[#4e5058]" />
        </div>
        <div className="flex-1 min-w-0 space-y-8">
          <div>
            <h3 className="text-[15px] font-semibold text-white">No Server Boost</h3>
            <p className="text-[13px] text-[#949ba4] mt-1">No one has boosted this server yet. Boost to unlock more sticker slots.</p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
              <div>
                <h3 className="text-[15px] font-semibold text-white">Free Slots</h3>
                <p className="text-[13px] text-[#949ba4]">5 of 5 slots available</p>
              </div>
            </div>
            {children}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-white">Level 1</h3>
              <p className="text-[13px] text-[#949ba4]">+10 Sticker Slots</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[#949ba4]">2 Boosts 🔒</span>
              <button type="button" className="px-4 py-2 rounded-[4px] bg-[#248046] text-white text-[13px] font-semibold hover:bg-[#1a6334]">
                Buy Level
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SoundboardPanelShell({ children }: { children?: React.ReactNode }) {
  return (
    <div>
      <h1 className={hsTw.title}>Soundboard</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-4 max-w-2xl`}>
        Upload custom sound reactions that anyone in this server can use.
      </p>
      {children}
    </div>
  );
}

export function AccessPanel() {
  const [mode, setMode] = useState<'invite' | 'apply' | 'discover'>('invite');
  const [age, setAge] = useState(false);
  const [rules, setRules] = useState(false);
  const [ruleDraft, setRuleDraft] = useState('');
  const [rulesList, setRulesList] = useState<string[]>([]);
  return (
    <div className="max-w-3xl">
      <h1 className={hsTw.title}>Access</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-6`}>
        How can people join your server?{' '}
        <button type="button" className="text-[#00a8fc] hover:underline">
          Learn More
        </button>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { id: 'invite' as const, title: 'Invite Only', desc: 'People can join your server directly with an invite.', icon: '🔒' },
          { id: 'apply' as const, title: 'Apply to Join', desc: 'People must submit an application and be approved to join.', icon: '✉️' },
          { id: 'discover' as const, title: 'Discoverable', desc: 'Anyone can join your server directly through Server Discovery.', icon: '🌐', dim: true },
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => !c.dim && setMode(c.id)}
            disabled={c.dim}
            className={`text-left p-4 rounded-lg border-2 transition-colors ${
              mode === c.id ? 'border-white bg-[#2b2d31]' : 'border-[#1e1f22] bg-[#2b2d31] hover:border-[#4e5058]'
            } ${c.dim ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="text-2xl mb-2 block">{c.icon}</span>
            <p className="text-[15px] font-semibold text-white mb-1">{c.title}</p>
            <p className="text-[12px] text-[#949ba4] leading-snug">{c.desc}</p>
          </button>
        ))}
      </div>
      <SettingsDivider />
      <ToggleRow
        label="Age-Restricted Server"
        description="Users will need to confirm they are over the legal age to view the content in this server."
        checked={age}
        onChange={setAge}
      />
      <SettingsDivider />
      <ToggleRow
        label="Server Rules"
        description="Members must agree to rules before they can chat or interact in the server."
        checked={rules}
        onChange={setRules}
      />
      {rules && (
        <div className="mt-4 p-4 rounded-lg bg-[#111214] border border-[#1e1f22] space-y-3">
          <p className="text-[11px] font-bold text-[#949ba4] uppercase tracking-wide">Rules</p>
          <input
            value={ruleDraft}
            onChange={(e) => setRuleDraft(e.target.value)}
            placeholder="Enter a rule"
            className={hsTw.input}
          />
          <button
            type="button"
            onClick={() => {
              if (ruleDraft.trim()) {
                setRulesList((l) => [...l, ruleDraft.trim()]);
                setRuleDraft('');
              }
            }}
            className="w-full py-3 rounded-lg border-2 border-dashed border-[#4e5058] text-[#b5bac1] text-[13px] font-medium hover:border-[#5865f2] hover:text-white flex items-center justify-center gap-2"
          >
            + Add a rule
          </button>
          {rulesList.length > 0 && (
            <ul className="space-y-1">
              {rulesList.map((r, i) => (
                <li key={i} className="text-[13px] text-[#dbdee1]">
                  • {r}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] font-bold text-[#949ba4] uppercase tracking-wide pt-2">Example rules</p>
          <div className="flex flex-wrap gap-2">
            {['Be civil and respectful', 'No spam or self-promotion', 'No age-restricted or obscene content', 'Help keep things safe'].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setRulesList((l) => [...l, ex])}
                className="px-3 py-1.5 rounded-full bg-[#2b2d31] text-[12px] text-[#dbdee1] border border-[#1e1f22] hover:border-[#5865f2]"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function IntegrationsPanel() {
  return (
    <div className="max-w-3xl">
      <h1 className={hsTw.title}>Integrations</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-6`}>
        Customize your server with integrations. Manage webhooks, followed channels, and apps.{' '}
        <button type="button" className="text-[#00a8fc] hover:underline">
          Learn more about managing integrations.
        </button>
      </p>
      <div className="space-y-3">
        <div className={`${hsTw.card} p-4 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#1e1f22] flex items-center justify-center text-[#b5bac1]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-white">Webhooks</p>
              <p className="text-[13px] text-[#949ba4]">0 webhooks</p>
            </div>
          </div>
          <button type="button" className={hsTw.btnPrimary}>
            Create Webhook
          </button>
        </div>
        <div className={`${hsTw.card} p-4 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#1e1f22] flex items-center justify-center text-[#b5bac1]">⎘</div>
            <div>
              <p className="text-[15px] font-semibold text-white">Channels Followed</p>
              <p className="text-[13px] text-[#949ba4]">0 channels</p>
            </div>
          </div>
          <button type="button" className={hsTw.btnPrimary}>
            Learn More
          </button>
        </div>
      </div>
      <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#949ba4] mt-8 mb-3">Bots and Apps</h2>
      <p className="text-[13px] text-[#949ba4]">No bots installed yet.</p>
    </div>
  );
}

export function SafetySetupPanel() {
  const [beta, setBeta] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [alerts, setAlerts] = useState(false);
  return (
    <div className="max-w-2xl">
      <h1 className={hsTw.title}>Safety Setup</h1>
      <div className="mt-6">
        <ToggleRow
          label="Show Members In Channel List"
          description="Enabling this will show the members page in the channel list, allowing you to quickly see who's recently joined your server."
          checked={beta}
          onChange={setBeta}
          badge="BETA"
        />
        <InfoBanner>Becoming a community will automatically enable this experience for you.</InfoBanner>
      </div>
      <SettingsDivider />
      <div>
        <h2 className="text-[16px] font-semibold text-white mb-1">Verification Level</h2>
        <p className="text-[13px] text-[#949ba4] mb-3">
          Members must meet criteria before they can send messages or DM server members unless they have a role.
        </p>
        <div className={`${hsTw.card} p-4 flex items-center justify-between`}>
          <div>
            <p className="text-[15px] text-white font-medium">None</p>
            <p className="text-[13px] text-[#949ba4]">Unrestricted</p>
          </div>
          <button type="button" className="text-[#00a8fc] text-[13px] font-medium hover:underline">
            Change
          </button>
        </div>
      </div>
      <SettingsDivider />
      <ToggleRow
        label="Require 2FA for moderator actions"
        description="Moderators must have two-factor authentication enabled to ban, kick, or timeout members and delete messages."
        checked={mfa}
        onChange={setMfa}
      />
      <SettingsDivider />
      <div>
        <h2 className="text-[16px] font-semibold text-white mb-1">Sensitive content filters</h2>
        <p className="text-[13px] text-[#949ba4] mb-3">
          Choose if server members can share image-based media detected by sensitive content filters.{' '}
          <button type="button" className="text-[#00a8fc] hover:underline">
            Learn more
          </button>
        </p>
        <div className={`${hsTw.card} p-4 flex items-center justify-between`}>
          <div>
            <p className="text-[15px] text-white font-medium">Do not filter</p>
            <p className="text-[13px] text-[#949ba4]">Messages will not be filtered for sensitive image-based media.</p>
          </div>
          <button type="button" className="text-[#00a8fc] text-[13px] font-medium hover:underline">
            Change
          </button>
        </div>
      </div>
      <SettingsDivider />
      <ToggleRow
        label="Activity Alerts"
        description="Receive notifications for DM or join activity that exceeds usual numbers for your server."
        checked={alerts}
        onChange={setAlerts}
      />
      <div className="mt-4">
        <SelectField
          label="Safety Notifications Channel"
          value=""
          onChange={() => {}}
          options={[{ value: '', label: 'Select...' }]}
        />
        <p className="text-[12px] text-[#949ba4] mt-2">Anyone with access to this text channel will be able to see the notifications.</p>
      </div>
    </div>
  );
}

export function AuditLogPanel() {
  return (
    <div className="max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <h1 className={hsTw.title}>Audit Log</h1>
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase text-[#949ba4] mb-1">Filter by User</p>
            <SelectField value="all" onChange={() => {}} options={[{ value: 'all', label: 'All Users' }]} />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-[#949ba4] mb-1">Filter by Action</p>
            <SelectField value="all" onChange={() => {}} options={[{ value: 'all', label: 'All Actions' }]} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            className={`w-full ${hsTw.card} p-4 flex items-center gap-3 text-left hover:bg-[#35373c] transition-colors`}
          >
            <span className="text-[#949ba4]">📋</span>
            <div className="w-9 h-9 rounded-full bg-[#5865f2] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] text-[#dbdee1]">
                <span className="font-medium text-white">Moderator</span> made changes to <span className="text-[#00a8fc]">#general</span>
              </p>
              <p className="text-[12px] text-[#949ba4]">Today at 3:22 PM — Today at 3:52 PM</p>
            </div>
            <span className="text-[#949ba4]">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BansPanel({ hubId }: { hubId?: string }) {
  const [bans, setBans] = useState<import('../../types').HubBan[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hubId) return;
    setLoading(true);
    setError('');
    api.listBans(hubId)
      .then((res) => setBans(res.bans))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bans'))
      .finally(() => setLoading(false));
  }, [hubId]);

  const handleUnban = async (userId: string) => {
    if (!hubId) return;
    const previousBans = bans;
    setBans((prev) => prev.filter((b) => b.user_id !== userId));
    try {
      await api.unbanMember(hubId, userId);
    } catch (err) {
      setBans(previousBans);
      setError(err instanceof Error ? err.message : 'Failed to revoke ban');
    }
  };

  const filtered = search.trim()
    ? bans.filter((b) => b.username?.toLowerCase().includes(search.toLowerCase()) || b.user_id.includes(search))
    : bans;

  return (
    <div className="max-w-3xl">
      <h1 className={hsTw.title}>Server Ban List</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-4`}>
        Bans are by account.{' '}
        <button type="button" className="text-[#00a8fc] hover:underline">
          Moderation
        </button>
      </p>
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#949ba4]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Bans by User Id or Username" className={hsTw.input + ' pl-10'} />
        </div>
      </div>
      {error && <p className="text-[#ed4245] text-[13px] mb-3">{error}</p>}
      <div className={`${hsTw.card} divide-y divide-[#1e1f22]`}>
        {loading ? (
          <p className="p-6 text-[13px] text-[#949ba4] text-center">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-[13px] text-[#949ba4] text-center">No banned users to display.</p>
        ) : (
          filtered.map((b) => (
            <div key={b.user_id} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#5865f2] shrink-0 flex items-center justify-center text-white text-sm font-bold">
                {(b.display_name || b.username || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-white font-medium truncate">{b.display_name || b.username || b.user_id.slice(0, 8)}</p>
                {b.reason && <p className="text-[12px] text-[#949ba4] truncate">{b.reason}</p>}
                <p className="text-[11px] text-[#949ba4]">{new Date(b.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => handleUnban(b.user_id)} className="px-3 py-1.5 text-xs font-medium rounded bg-[#ed4245]/20 text-[#ed4245] hover:bg-[#ed4245]/30 transition-colors">
                Revoke Ban
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AutoModPanel({ hubId }: { hubId?: string }) {
  const [settings, setSettings] = useState<import('../../types').HubAutoModSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!hubId) return;
    api.getAutoModSettings(hubId).then(setSettings).catch((err) => {
      setSaveError(err instanceof Error ? err.message : 'Failed to load settings');
    });
  }, [hubId]);

  const handleToggle = async (enabled: boolean) => {
    if (!settings || !hubId) return;
    const previous = settings;
    const updated = { ...settings, enabled };
    setSettings(updated);
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.updateAutoModSettings(hubId, updated);
      setSettings(res);
    } catch (err) {
      setSettings(previous);
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  };

  const handleThreshold = (_field: 'toxicity_threshold' | 'spam_threshold' | 'nsfw_threshold', value: number) => {
    if (!settings || !hubId) return;
    const updated = { ...settings, [_field]: value };
    setSettings(updated);
  };

  const handleSave = async () => {
    if (!settings || !hubId) return;
    const previous = settings;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.updateAutoModSettings(hubId, settings);
      setSettings(res);
    } catch (err) {
      setSettings(previous);
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl">
      <h1 className={hsTw.title}>AutoMod</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-6`}>
        Content moderation powered by LocalMod AI. Automatically filter messages for toxicity, spam, and NSFW content.
      </p>

      {saveError && !settings && <p className="text-[#ed4245] text-[13px] mb-4">{saveError}</p>}

      {settings && (
        <>
          <ToggleRow
            label="Enable AutoMod"
            description="When enabled, messages in this server are automatically checked by AI moderation."
            checked={settings.enabled}
            onChange={handleToggle}
          />
          <SettingsDivider />

          {settings.enabled && (
            <>
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#949ba4] mb-3">Sensitivity Thresholds</h2>
              <p className="text-[13px] text-[#949ba4] mb-4">Lower values are more strict. Messages scoring above the threshold will be blocked.</p>

              <div className="space-y-4 mb-6">
                <ThresholdSlider label="Toxicity" value={settings.toxicity_threshold} onChange={(v) => handleThreshold('toxicity_threshold', v)} />
                <ThresholdSlider label="Spam" value={settings.spam_threshold} onChange={(v) => handleThreshold('spam_threshold', v)} />
                <ThresholdSlider label="NSFW Text" value={settings.nsfw_threshold} onChange={(v) => handleThreshold('nsfw_threshold', v)} />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className={hsTw.btnPrimary + ' disabled:opacity-50'}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {saveError && <p className="text-[#ed4245] text-[13px] mt-2">{saveError}</p>}
              <SettingsDivider />
            </>
          )}
        </>
      )}

      <h2 className="text-[16px] font-semibold text-white mb-2">Sensitive content filters</h2>
      <p className="text-[13px] text-[#949ba4] mb-3">
        Image-based media is automatically scanned for NSFW content when uploaded. Flagged images are removed.
      </p>
      <div className={`${hsTw.card} p-4 flex items-center justify-between`}>
        <div>
          <p className="text-[15px] text-white font-medium">Image NSFW Detection</p>
          <p className="text-[13px] text-[#949ba4]">Automatically enabled for all image uploads.</p>
        </div>
        <span className="text-[#57f287] text-[13px] font-medium">Active</span>
      </div>
    </div>
  );
}

function ThresholdSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-[14px] text-[#dbdee1] w-24">{label}</span>
      <input
        type="range"
        min={0.1}
        max={1.0}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[#5865f2]"
      />
      <span className="text-[13px] text-[#949ba4] w-12 text-right">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

export function EnableCommunityPanel() {
  return (
    <div className="max-w-4xl mx-auto text-center py-4">
      <div className="mb-8 flex justify-center">
        <div className="w-48 h-40 rounded-2xl bg-gradient-to-br from-[#fee75c]/20 to-[#5865f2]/30 flex items-center justify-center text-6xl border border-[#1e1f22]">
          🏠
        </div>
      </div>
      <h1 className="text-[24px] font-bold text-white mb-3">Are you building a Community?</h1>
      <p className="text-[15px] text-[#b5bac1] max-w-xl mx-auto mb-6">
        Community servers get access to discovery, insights, and more.{' '}
        <button type="button" className="text-[#00a8fc] hover:underline">
          Learn more.
        </button>
      </p>
      <button type="button" className="px-8 py-3 rounded-md bg-[#5865f2] text-white text-[15px] font-semibold hover:bg-[#4752c4]">
        Enable Community
      </button>
      <SettingsDivider />
      <p className="text-[14px] text-[#b5bac1] max-w-2xl mx-auto mb-8">
        Community Servers are designed for public spaces where people gather around a shared interest.{' '}
        <button type="button" className="text-[#00a8fc] hover:underline">
          Learn more here.
        </button>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
        {[
          { icon: '📈', title: 'Grow your community', body: 'Reach new people through Server Discovery.' },
          { icon: '📊', title: 'Keep members engaged', body: 'Use Server Insights to understand activity.' },
          { icon: 'ℹ️', title: 'Stay informed', body: 'Get updates and best practices for your server.' },
        ].map((f) => (
          <div key={f.title} className={`${hsTw.card} p-4`}>
            <span className="text-2xl mb-2 block">{f.icon}</span>
            <p className="text-[15px] font-semibold text-white mb-1">{f.title}</p>
            <p className="text-[13px] text-[#949ba4] leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ServerTemplatePanel() {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <div className="max-w-2xl">
      <h1 className={hsTw.title}>Server Template</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-4`}>
        Templates let others create a new server instantly with your channels, roles, and settings pre-filled.
      </p>
      <p className={`${hsTw.subtitle} mb-6`}>Use this to share your server structure without copying messages or members.</p>
      <div className={`${hsTw.card} p-6 grid grid-cols-1 md:grid-cols-2 gap-6 mb-8`}>
        <div>
          <p className="text-[11px] font-bold text-[#57f287] uppercase tracking-wide mb-3">Templates will copy</p>
          <ul className="space-y-2 text-[13px] text-[#dbdee1]">
            {['Channels and channel topics', 'Roles and permissions', 'Default server settings'].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="text-[#57f287]">✓</span> {x}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-bold text-[#ed4245] uppercase tracking-wide mb-3">Templates will not copy</p>
          <ul className="space-y-2 text-[13px] text-[#dbdee1]">
            {['Messages or any content', 'Members or bots', 'Your server icon, Boosts, or other perks'].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span className="text-[#ed4245]">✕</span> {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <label className="block mb-4">
        <span className="text-[12px] font-bold uppercase tracking-wider text-[#b5bac1] mb-2 block">
          Template Title <span className="text-[#ed4245]">*</span>
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Who is this server for? E.g. School Club, Artists' Community"
          className={hsTw.input + ' ring-1 ring-[#5865f2]/50'}
        />
      </label>
      <label className="block mb-6">
        <span className="text-[12px] font-bold uppercase tracking-wider text-[#b5bac1] mb-2 block">Template Description</span>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What can people do in this server?"
          rows={4}
          className={hsTw.input + ' resize-y min-h-[100px]'}
        />
      </label>
      <button type="button" className="px-5 py-2.5 rounded-[4px] bg-[#4e5058] text-white text-[13px] font-medium hover:bg-[#5c5e66]">
        Generate Template
      </button>
    </div>
  );
}

export function AppDirectoryLinkPanel() {
  return (
    <div className="max-w-xl">
      <h1 className={hsTw.title}>App Directory</h1>
      <p className={`${hsTw.subtitle} mt-2 mb-6`}>Browse and add apps to your server.</p>
      <a
        href="https://discord.com/application-directory"
        target="_blank"
        rel="noopener noreferrer"
        className={hsTw.btnPrimary + ' inline-flex items-center gap-2'}
      >
        Open App Directory
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
        </svg>
      </a>
      <p className="text-[12px] text-[#949ba4] mt-4">Opens Discord App Directory in a new tab (reference UI).</p>
    </div>
  );
}
