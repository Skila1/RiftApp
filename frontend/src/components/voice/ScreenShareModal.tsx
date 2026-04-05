import ConfirmModal from '../modals/ConfirmModal';
import { useVoiceStore, type ScreenShareKind } from '../../stores/voiceStore';

const OPTIONS: Array<{ value: ScreenShareKind; label: string; description: string }> = [
  { value: 'screen', label: 'Screen', description: 'Share your entire display for presentations or demos.' },
  { value: 'window', label: 'Window', description: 'Share a single app window while keeping the rest private.' },
  { value: 'tab', label: 'Tab', description: 'Share a browser tab when you only need one webpage.' },
];

export default function ScreenShareModal() {
  const isOpen = useVoiceStore((s) => s.screenShareModalOpen);
  const selected = useVoiceStore((s) => s.screenShareKind);
  const loading = useVoiceStore((s) => s.screenShareRequesting);
  const setKind = useVoiceStore((s) => s.setScreenShareKind);
  const confirm = useVoiceStore((s) => s.confirmScreenShare);
  const cancel = useVoiceStore((s) => s.cancelScreenShareModal);

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Share Your Screen"
      description="Choose what you want to share. Your browser will still show its secure picker next."
      confirmText="Share"
      cancelText="Cancel"
      variant="default"
      loading={loading}
      onConfirm={confirm}
      onCancel={cancel}
      allowBackdropClose
    >
      <div className="space-y-2">
        {OPTIONS.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                active
                  ? 'border-[#5865f2] bg-[#5865f2]/10 text-white'
                  : 'border-[#1e1f22] bg-[#2b2d31] text-[#dbdee1] hover:border-[#4e5058] hover:bg-[#35373c]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold">{option.label}</p>
                  <p className="text-[12px] text-[#b5bac1] mt-1">{option.description}</p>
                </div>
                <span
                  className={`w-4 h-4 rounded-full border flex-shrink-0 ${
                    active ? 'border-[#5865f2] bg-[#5865f2]' : 'border-[#4e5058]'
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </ConfirmModal>
  );
}