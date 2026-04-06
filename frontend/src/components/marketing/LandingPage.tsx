import { Link } from 'react-router-dom';
import MarketingLogo from './MarketingLogo';

const DOWNLOAD_URL = 'https://github.com/Skila1/RiftApp/releases/latest';

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #5865f2 0%, #3c45a5 50%, #0f1117 100%)',
        }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[600px] w-[600px] rounded-full bg-indigo-400/10 blur-3xl" />

        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-12 px-6 pb-24 pt-20 lg:flex-row lg:gap-16 lg:pb-32 lg:pt-28">
          {/* Left – copy */}
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-4xl font-extrabold uppercase leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Communication that's all{' '}
              <span className="text-indigo-200">fast &amp; clean</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-indigo-100/80 lg:mx-0">
              Rift is great for hanging out with friends, or building a worldwide
              community. Customize your own space to talk, stream, and connect.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <a
                href={DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full bg-white px-7 py-3 text-sm font-semibold text-gray-900 shadow-lg transition-all hover:bg-gray-100 hover:shadow-xl"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                </svg>
                Download for Windows
              </a>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur transition-all hover:bg-white/20"
              >
                Open Rift in your browser
              </Link>
            </div>
          </div>

          {/* Right – app mockup placeholder */}
          <div className="flex-1">
            <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl lg:max-w-none">
              <div className="flex items-center gap-1.5 border-b border-white/5 bg-[#161922] px-4 py-2.5">
                <div className="h-3 w-3 rounded-full bg-[#ed4245]/80" />
                <div className="h-3 w-3 rounded-full bg-[#faa61a]/80" />
                <div className="h-3 w-3 rounded-full bg-[#43b581]/80" />
                <span className="ml-3 text-xs text-white/40">Rift</span>
              </div>
              <div className="flex h-64 items-center justify-center sm:h-80 lg:h-96">
                <div className="text-center">
                  <MarketingLogo className="mx-auto h-16 w-16 rounded-2xl opacity-60" />
                  <p className="mt-4 text-sm text-white/30">Your Rift experience</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature highlights ───────────────────────────── */}
      <section className="bg-[#f6f6fe] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-10 md:grid-cols-3">
            {[
              {
                icon: (
                  <svg className="h-8 w-8 text-marketing-hero" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                ),
                title: 'Instant messaging',
                desc: 'Send messages, share media, and connect with friends in real time. No lag, no fuss.',
              },
              {
                icon: (
                  <svg className="h-8 w-8 text-marketing-hero" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                ),
                title: 'Voice & streaming',
                desc: 'Crystal clear voice channels and screen sharing. Jump in and out anytime.',
              },
              {
                icon: (
                  <svg className="h-8 w-8 text-marketing-hero" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                ),
                title: 'Hubs for everyone',
                desc: 'Create communities with channels, roles, and permissions. Your hub, your rules.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 inline-flex rounded-xl bg-marketing-light-accent p-3">
                  {f.icon}
                </div>
                <h3 className="mb-2 text-lg font-bold text-gray-900">{f.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────── */}
      <section className="bg-[#f6f6fe] pb-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-extrabold uppercase tracking-tight text-gray-900 sm:text-4xl">
            Ready to start your journey?
          </h2>
          <p className="mt-4 text-gray-600">
            Join thousands already on Rift. Download the app or get started in your browser.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-full bg-marketing-hero px-7 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-marketing-hero-dark hover:shadow-xl"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
              </svg>
              Download for Windows
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
