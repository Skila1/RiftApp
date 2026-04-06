import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import MarketingLogo from './MarketingLogo';

const NAV_LINKS = [
  { label: 'Discover', to: '/discover' },
  { label: 'Support', to: '/support' },
];

export default function MarketingNav() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHero = location.pathname === '/';

  return (
    <nav
      className={`sticky top-0 z-50 w-full transition-colors ${
        isHero ? 'bg-marketing-hero' : 'bg-white border-b border-gray-200'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <MarketingLogo className="h-8 w-8 rounded-lg" />
          <span
            className={`text-lg font-bold tracking-tight ${
              isHero ? 'text-white' : 'text-gray-900'
            }`}
          >
            Rift
          </span>
        </Link>

        {/* Center links */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium transition-colors hover:opacity-80 ${
                isHero ? 'text-white' : 'text-gray-700 hover:text-gray-900'
              } ${location.pathname === link.to ? 'opacity-100' : 'opacity-70'}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* CTA */}
        <Link
          to={isAuthenticated ? '/app' : '/login'}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
            isHero
              ? 'bg-white text-gray-900 hover:bg-gray-100 hover:shadow-lg'
              : 'bg-marketing-hero text-white hover:bg-marketing-hero-dark'
          }`}
        >
          {isAuthenticated ? 'Open Rift' : 'Login'}
        </Link>
      </div>
    </nav>
  );
}
