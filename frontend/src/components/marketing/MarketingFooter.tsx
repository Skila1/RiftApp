import { Link } from 'react-router-dom';
import MarketingLogo from './MarketingLogo';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Download', to: 'https://github.com/Skila1/RiftApp/releases/latest', external: true },
      { label: 'Status', to: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '#' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Support', to: '/support' },
      { label: 'Discover Hubs', to: '/discover' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { label: 'Terms', to: '#' },
      { label: 'Privacy', to: '#' },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="bg-[#1a1a4e] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-6">
              <MarketingLogo className="h-10 w-10 rounded-xl" />
            </div>
            <p className="text-sm text-indigo-200/60">
              Fast. Clean. Yours.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-marketing-hero">
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) =>
                  link.external ? (
                    <li key={link.label}>
                      <a
                        href={link.to}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-indigo-200/70 transition-colors hover:text-white hover:underline"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-sm text-indigo-200/70 transition-colors hover:text-white hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider + bottom row */}
        <div className="mt-14 border-t border-white/10 pt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <MarketingLogo className="h-7 w-7 rounded-lg" />
            <span className="text-sm font-semibold">Rift</span>
          </div>
          <Link
            to="/login"
            className="rounded-full bg-marketing-hero px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-marketing-hero-dark"
          >
            Open Rift
          </Link>
        </div>
      </div>
    </footer>
  );
}
