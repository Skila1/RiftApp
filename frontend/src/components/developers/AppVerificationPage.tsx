import { useDeveloperStore } from '../../stores/developerStore';

export default function AppVerificationPage() {
  const currentApp = useDeveloperStore((s) => s.currentApp);

  if (!currentApp) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-riftapp-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  const requirements = [
    { label: 'App has a name and description', met: !!(currentApp.name && currentApp.description) },
    { label: 'Terms of Service URL is set', met: !!currentApp.terms_of_service_url },
    { label: 'Privacy Policy URL is set', met: !!currentApp.privacy_policy_url },
    { label: 'App icon is set', met: !!currentApp.icon },
    { label: 'Bot is configured', met: !!currentApp.bot_user_id },
    { label: 'App is in at least 75 servers', met: (currentApp.approximate_guild_count || 0) >= 75 },
  ];

  const allMet = requirements.every((r) => r.met);
  const metCount = requirements.filter((r) => r.met).length;

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <h2 className="text-xl font-bold mb-6">App Verification</h2>

      {/* Status */}
      <div className="mb-8 p-4 rounded-xl bg-riftapp-content-elevated border border-riftapp-border/40">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${allMet ? 'bg-riftapp-success' : 'bg-yellow-500'}`} />
          <div>
            <p className="text-sm font-medium">
              {allMet ? 'Eligible for Verification' : 'Not Yet Eligible'}
            </p>
            <p className="text-xs text-riftapp-text-dim mt-0.5">
              {metCount}/{requirements.length} requirements met
            </p>
          </div>
        </div>
      </div>

      {/* Requirements checklist */}
      <div className="mb-8">
        <h3 className="text-sm font-bold mb-4">Requirements</h3>
        <div className="space-y-3">
          {requirements.map((req) => (
            <div key={req.label} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                req.met ? 'bg-riftapp-success/20 text-riftapp-success' : 'bg-riftapp-content-elevated border border-riftapp-border/50'
              }`}>
                {req.met && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span className={`text-sm ${req.met ? 'text-riftapp-text' : 'text-riftapp-text-muted'}`}>
                {req.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Submit button */}
      <button
        disabled={!allMet}
        className="btn-primary px-6 py-3 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Submit for Verification
      </button>
      {!allMet && (
        <p className="text-xs text-riftapp-text-dim mt-2">Complete all requirements above to submit for verification.</p>
      )}
    </div>
  );
}
