/** Canonical Rift mark: `frontend/public/icon.png` (same as favicon / desktop app). */
export default function MarketingLogo({
  className = 'h-8 w-8',
}: {
  className?: string;
}) {
  return <img src="/icon.png" alt="Rift" className={className} />;
}
