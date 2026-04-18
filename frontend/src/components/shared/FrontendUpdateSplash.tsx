import { useFrontendUpdateStore } from '../../stores/frontendUpdateStore';
import { getDesktop } from '../../utils/desktop';

function RiftSplashMark() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#6d78ff,#4b52df_58%,#363bb1)] shadow-[0_24px_80px_rgba(88,101,242,0.38)]">
      <div className="absolute inset-[8px] rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_58%)]" />
      <svg viewBox="0 0 64 64" className="relative h-12 w-12 text-white" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 22c5.5-8.5 16.5-8.5 22 0 3.5 5.5 9.5 5.5 14.5 0" />
        <path d="M14 42c5.5-8.5 16.5-8.5 22 0 3.5 5.5 9.5 5.5 14.5 0" />
      </svg>
    </div>
  );
}

export default function FrontendUpdateSplash() {
  const applyingUpdate = useFrontendUpdateStore((state) => state.applyingUpdate);
  const desktop = getDesktop();

  if (desktop || !applyingUpdate) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[500] overflow-hidden bg-[#1b1d23] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,101,242,0.18),transparent_42%),linear-gradient(180deg,#1b1d23_0%,#17191f_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-position:center] [background-size:32px_32px]" />

      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        <RiftSplashMark />
        <div className="mt-10 max-w-xl text-[28px] font-semibold tracking-[-0.03em] text-white sm:text-[32px]">
          Refreshing Rift
        </div>
        <p className="mt-4 max-w-lg text-[15px] italic leading-7 text-[#c3cad7] sm:text-[16px]">
          Pulling in the latest build and stitching your session back together.
        </p>
        <div className="mt-10 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7f8ea3]">
          Syncing
        </div>
        <div className="mt-3 h-[6px] w-[220px] overflow-hidden rounded-full bg-[#20232a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="h-full w-[38%] rounded-full bg-[linear-gradient(90deg,#5865f2,#7c86ff)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}