import Link from 'next/link';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import AuthHashToast from '@/app/(public)/components/AuthHashToast';
import {
  FaSearch,
  FaShuttleVan,
  FaDollarSign,
  FaClock,
  FaChair,
  FaSync,
  FaRoute,
  FaCheckCircle,
  FaBolt,
  FaArrowRight,
} from 'react-icons/fa';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';
import { listTrustedOperatorRatings } from '@/lib/db/operator-feedback';

const TrustedOperatorsGrid = dynamic(
  () => import('@/app/(public)/components/TrustedOperatorsGrid'),
  {
    loading: () => (
      <div className="card-glow rounded-2xl p-6 text-center text-sm text-muted-theme">
        Loading operator ratings...
      </div>
    ),
  }
);

export const revalidate = 120;

const FEATURES = [
  {
    icon: <FaSearch />,
    title: 'Easy Route Search',
    tag: 'Smart Search',
    text: 'Find the best transport routes instantly with smart filtering.',
  },
  {
    icon: <FaShuttleVan />,
    title: 'Available Vehicles',
    tag: 'Multi-Vehicle',
    text: 'Jeep, Bus, Van and Tricycle — all in one place.',
  },
  {
    icon: <FaDollarSign />,
    title: 'Compare Fares',
    tag: 'Save Money',
    text: 'Choose the most cost-effective transport option for your trip.',
  },
  {
    icon: <FaChair />,
    title: 'Seat Reservation',
    tag: 'Instant Booking',
    text: 'Reserve seats instantly — no account needed.',
  },
];

const STEPS = [
  {
    icon: <FaRoute />,
    title: 'Enter Your Locations',
    text: 'Input your origin and destination. Our system finds all available routes.',
  },
  {
    icon: <FaShuttleVan />,
    title: 'Choose Your Vehicle',
    text: 'Select from jeepneys, buses, vans, or tricycles — whatever suits you.',
  },
  {
    icon: <FaChair />,
    title: 'Reserve & Go',
    text: 'Compare fares, pick a time, and reserve your seat in seconds.',
  },
];

const STATS = [
  { icon: <FaRoute />, label: 'ROUTES', value: '50+' },
  { icon: <FaShuttleVan />, label: 'VEHICLES', value: '4' },
  { icon: <FaClock />, label: 'AVG SEARCH TIME', value: 'Less than 5s' },
  { icon: <FaChair />, label: 'RESERVATIONS', value: '1.2K+' },
];

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const HomePage = async ({ searchParams }: HomePageProps) => {
  const params = await searchParams;
  const code = params.code;
  const trustedParam = Array.isArray(params.trusted)
    ? params.trusted[0]
    : params.trusted;
  const trustedOnly = ['1', 'true', 'yes', 'trusted'].includes(
    String(trustedParam || '').toLowerCase()
  );

  // Prevent visible landing-page flash after OAuth by redirecting on the server.
  if (typeof code === 'string' && code) {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        nextParams.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => nextParams.append(key, v));
      }
    }
    nextParams.set('flow', 'login');
    redirect(`/auth/callback?${nextParams.toString()}`);
  }

  const trustedOperators = await listTrustedOperatorRatings(4, {
    trustedOnly,
  }).catch(() => []);
  const showTrustedOperatorSection = trustedOperators.length > 0 || trustedOnly;

  return (
    <main className="overflow-x-hidden">
      <AuthHashToast />

      {/* ── HERO ────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          {/* Left */}
          <FadeIn>
            <div className="section-badge mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-pulse" />
              Join{' '}
              <span className="font-bold" style={{ color: 'var(--primary)' }}>
                1,200+ commuters
              </span>{' '}
              using TranspoGuide
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-tight text-theme"
              style={{ fontStyle: 'normal' }}
            >
              Plan routes and reserve seats with a simple
              <br />
              <span className="text-gradient" style={{ fontStyle: 'italic' }}>
                workflow.
              </span>
            </h1>
            <p className="mt-5 text-lg text-muted-theme max-w-lg leading-relaxed">
              Find routes, compare fares, and reserve seats — all with one
              simple search. No account needed.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/route" className="btn-primary text-base group">
                Start Searching{' '}
                <FaArrowRight
                  className="group-hover:translate-x-1 transition-transform"
                  size={14}
                />
              </Link>
            </div>
            {/* Trust row */}
            <div className="mt-8 flex items-center gap-3 text-sm text-muted-theme">
              <div className="flex items-center gap-1.5">
                <FaCheckCircle className="text-[var(--primary)]" size={13} />
                Free to use
              </div>
              <span className="text-[var(--tg-border)]">•</span>
              <div className="flex items-center gap-1.5">
                <FaCheckCircle className="text-[var(--primary)]" size={13} />
                No account required
              </div>
            </div>
          </FadeIn>

          {/* Right — hero image card */}
          <FadeIn className="hidden lg:block" delay={0.08}>
            <div className="card-glow p-4 rounded-2xl">
              <div
                className="relative w-full aspect-video rounded-xl overflow-hidden"
                style={{ background: 'var(--tg-bg-alt)' }}
              >
<<<<<<< HEAD
                <video
                  className="absolute inset-0 w-full h-full object-cover rounded-xl"
                  src="/videos/vids.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
=======
                <Image
                  src="/images/bgterminal.jpg"
                  alt="Isabel Integrated Bus Terminal"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="absolute inset-0 w-full h-full object-cover rounded-xl"
>>>>>>> 8a818bca7aea478f34a0909c19490afcff2cf34c
                />
                <div className="absolute inset-0 rounded-xl backdrop-blur-[2px] bg-black/40" />
              </div>
              <div className="mt-4 flex items-center justify-between px-2 pb-2">
                <div>
                  <p className="text-theme font-semibold text-sm">
<<<<<<< HEAD
                    Isabel Teminal View
=======
                    Isabel Integrated Bus Terminal
>>>>>>> 8a818bca7aea478f34a0909c19490afcff2cf34c
                  </p>
                  <p className="text-muted-theme text-xs mt-0.5">
                    Find your fastest ride today
                  </p>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────── */}
      <section className="py-10 px-6">
        <div className="max-w-5xl mx-auto">
          <FadeIn className="card-glow p-6 md:p-8 rounded-2xl">
            <div className="flex items-center gap-4 mb-4">
              <span className="step-badge">Platform Growth</span>
              <span className="text-muted-theme text-sm">
                Trusted by commuters across Leyte
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {STATS.map((s, i) => (
                <div
                  key={i}
                  className="flex flex-col items-start gap-1 p-3 rounded-xl"
                  style={{ background: 'var(--tg-subtle)' }}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-theme font-semibold uppercase tracking-wider">
                    <span className="text-[var(--primary)]">{s.icon}</span>
                    {s.label}
                  </div>
                  <span className="text-[var(--primary)] font-extrabold text-xl md:text-2xl leading-tight">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {showTrustedOperatorSection && (
        <section id="trusted-operators" className="py-20 px-6">
          <div className="max-w-7xl mx-auto">
            <FadeIn className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-extrabold text-theme">
                Trusted{' '}
                <span className="text-gradient" style={{ fontStyle: 'italic' }}>
                  Van Operators
                </span>
              </h2>
              <p className="mt-3 text-muted-theme max-w-xl mx-auto">
                Ratings and feedback from commuters after confirmed downpayment.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 p-1 rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg-alt)]">
                <Link
                  href="/#trusted-operators"
                  scroll={false}
                  replace
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition"
                  style={
                    !trustedOnly
                      ? { background: 'var(--primary)', color: '#fff' }
                      : { color: 'var(--tg-muted)' }
                  }
                >
                  All Rated
                </Link>
                <Link
                  href="/?trusted=1#trusted-operators"
                  scroll={false}
                  replace
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg transition"
                  style={
                    trustedOnly
                      ? { background: 'var(--primary)', color: '#fff' }
                      : { color: 'var(--tg-muted)' }
                  }
                >
                  Trusted Only
                </Link>
              </div>
            </FadeIn>

            {trustedOperators.length === 0 ? (
              <div className="card-glow rounded-2xl p-6 text-center">
                <p className="text-theme font-semibold">
                  No trusted operators yet
                </p>
                <p className="text-sm text-muted-theme mt-1">
                  Trusted status needs at least 3 reviews and 4.2+ average
                  rating.
                </p>
              </div>
            ) : (
              <TrustedOperatorsGrid operators={trustedOperators} />
            )}
          </div>
        </section>
      )}

      {/* ── FEATURES (4 Ways / Why Choose) ──────────── */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <FadeIn className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-theme">
              4 Ways to{' '}
              <span className="text-gradient" style={{ fontStyle: 'italic' }}>
                Travel Smarter
              </span>
            </h2>
            <p className="mt-3 text-muted-theme max-w-lg mx-auto">
              Multiple transport options. One platform. Real-time information.
            </p>
          </FadeIn>

          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((item, i) => (
              <StaggerItem key={i}>
                <div className="card-glow p-7 flex flex-col gap-4 group rounded-2xl">
                  <div className="icon-badge">{item.icon}</div>
                  <div>
                    <h3 className="text-theme font-bold text-lg">
                      {item.title}
                    </h3>
                    <p className="text-[var(--primary)] text-sm font-semibold mt-0.5">
                      {item.tag}
                    </p>
                    <p className="text-muted-theme text-sm mt-2 leading-relaxed">
                      {item.text}
                    </p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── HOW IT WORKS (3 Steps) ─────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <FadeIn className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-theme">
              Get Started in{' '}
              <span className="text-gradient" style={{ fontStyle: 'italic' }}>
                3 Simple Steps
              </span>
            </h2>
            <p className="mt-3 text-muted-theme max-w-lg mx-auto">
              No scattered tools. No tech headaches. Just search, compare, and
              go.
            </p>
          </FadeIn>

          <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <StaggerItem key={i}>
                <div>
                  <div className="flex justify-center mb-4">
                    <span className="step-badge">Step {i + 1}</span>
                  </div>
                  <div className="card-glow p-8 text-center rounded-2xl group">
                    <div className="icon-badge mx-auto mb-5">{step.icon}</div>
                    <h3 className="text-theme font-bold text-xl mb-2">
                      {step.title}
                    </h3>
                    <p className="text-muted-theme text-sm leading-relaxed">
                      {step.text}
                    </p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── NO ACCOUNT NEEDED ──────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <FadeIn>
            <div className="section-badge">Accessibility</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-theme mt-3 mb-6">
              No Account{' '}
              <span className="text-gradient" style={{ fontStyle: 'italic' }}>
                Needed
              </span>
            </h2>
            <div className="space-y-4">
              {[
                {
                  title: 'Instant Access',
                  text: 'Start searching right away — no sign-up required.',
                },
                {
                  title: 'Privacy First',
                  text: "Your data stays private. We only ask for what's necessary.",
                },
                {
                  title: 'Simple Reservation',
                  text: 'Reserve van seats with just your name and contact info.',
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="icon-badge w-9 h-9 text-sm mt-0.5">
                    <FaCheckCircle />
                  </div>
                  <div>
                    <h4 className="text-theme font-semibold">{item.title}</h4>
                    <p className="text-muted-theme text-sm mt-0.5">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>

          <FadeIn className="flex flex-col gap-4" delay={0.08}>
            <div
              className="card-glow p-6 rounded-2xl flex items-center justify-between"
              style={{ borderColor: 'var(--tg-border-primary)' }}
            >
              <div>
                <h3 className="text-theme font-bold text-lg">Quick Access</h3>
                <p className="text-muted-theme text-sm mt-1">
                  Start using instantly — no barriers.
                </p>
                <Link
                  href="/route"
                  className="mt-3 btn-primary text-sm inline-flex"
                >
                  Get Started <FaArrowRight size={12} />
                </Link>
              </div>
              <div className="icon-badge w-14 h-14 text-2xl ml-6">
                <FaBolt />
              </div>
            </div>
            <div className="card-glow p-6 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="text-theme font-bold text-lg">Always Updated</h3>
                <p className="text-muted-theme text-sm mt-1">
                  Real-time fares and route information.
                </p>
                <span
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--primary)' }}
                >
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: 'var(--primary)' }}
                  />{' '}
                  Live Updates
                </span>
              </div>
              <div className="icon-badge w-14 h-14 text-2xl ml-6">
                <FaSync />
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────── */}
      <section className="py-24 px-6">
        <FadeIn className="max-w-3xl mx-auto">
          <div
            className="card-glow p-10 md:p-14 rounded-2xl text-center"
            style={{ background: 'var(--tg-bg-alt)' }}
          >
            <h2 className="text-3xl md:text-4xl font-extrabold text-theme">
              Ready to Turn Your{' '}
              <span className="text-gradient" style={{ fontStyle: 'italic' }}>
                Commute Into Comfort?
              </span>
            </h2>
            <p className="mt-4 text-muted-theme text-lg max-w-lg mx-auto">
              Join 1,200+ commuters planning smarter trips. Start free, no
              account required.
            </p>
            <div className="mt-8">
              <Link href="/route" className="btn-primary text-base group">
                Start Searching Free{' '}
                <FaArrowRight
                  size={14}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-theme">
              Free to start — No account required
            </p>
          </div>
        </FadeIn>
      </section>
    </main>
  );
};

export default HomePage;
