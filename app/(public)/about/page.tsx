import {
  FaRoute,
  FaUsers,
  FaShuttleVan,
  FaLeaf,
  FaShieldAlt,
  FaBullseye,
  FaArrowRight,
} from 'react-icons/fa';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';

const STATS = [
  { value: '50+', label: 'Active Routes' },
  { value: '4', label: 'Vehicle Types' },
  { value: '1,200+', label: 'Daily Commuters' },
];

const VALUES = [
  { icon: <FaBullseye />, title: 'Our Mission', text: 'To make public transportation accessible and understandable for every commuter in our community.' },
  { icon: <FaShieldAlt />, title: 'Privacy First', text: 'We collect only the minimum data needed. No accounts required to use the core features.' },
  { icon: <FaLeaf />, title: 'Sustainability', text: 'By promoting public transport, we contribute to reducing carbon footprints and traffic congestion.' },
];

const TEAM = [
  { name: 'Route Navigation', desc: 'Smart routing across all major destinations.', icon: <FaRoute /> },
  { name: 'Fleet Coverage', desc: 'Jeepneys, buses, vans, tricycles and more.', icon: <FaShuttleVan /> },
  { name: 'Community Focused', desc: 'Built for and by local commuters.', icon: <FaUsers /> },
];

const AboutPage = () => {
  return (
    <main>
      {/* Hero */}
      <section className="relative pt-40 pb-24 px-6">
        <FadeIn className="max-w-3xl mx-auto text-center">
          <div className="section-badge mx-auto mb-6">About Us</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
            Simplifying <span className="text-gradient" style={{ fontStyle: 'italic' }}>Public Transport</span>
            <br />for Everyone
          </h1>
          <p className="mt-5 text-muted-theme text-lg leading-relaxed max-w-2xl mx-auto">
            TranspoGuide is your ultimate companion for navigating public transportation with ease and efficiency.
          </p>
          <div className="mt-8">
            <a href="/route" className="btn-primary inline-flex group">
              Explore Routes <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </FadeIn>
      </section>

      {/* Stats */}
      <section className="py-10 px-6">
        <FadeIn className="max-w-4xl mx-auto card-glow p-6 md:p-8 rounded-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {STATS.map((s, i) => (
              <div key={i}>
                <div className="stat-number">{s.value}</div>
                <p className="text-muted-theme text-sm mt-2 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* Story */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
          <FadeIn className="">
            <div className="section-badge">Our Story</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-theme mt-3 mb-5">
              Built for <span className="text-gradient" style={{ fontStyle: 'italic' }}>Real Commuters</span>
            </h2>
            <p className="text-muted-theme leading-relaxed mb-4">
              Whether you&apos;re a daily commuter or an occasional traveler, TranspoGuide helps you make informed decisions about your journeys.
            </p>
            <p className="text-muted-theme leading-relaxed">
              With TranspoGuide, exploring new destinations and managing your daily commute has never been easier.
            </p>
          </FadeIn>
          <Stagger className="grid grid-cols-1 gap-4">
            {TEAM.map((t, i) => (
              <StaggerItem key={i} className="card-glow p-5 rounded-2xl flex items-center gap-5 group">
                <div className="icon-badge">{t.icon}</div>
                <div>
                  <h3 className="text-theme font-semibold">{t.name}</h3>
                  <p className="text-muted-theme text-sm mt-0.5">{t.desc}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <FadeIn className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-theme">
              What We <span className="text-gradient" style={{ fontStyle: 'italic' }}>Stand For</span>
            </h2>
          </FadeIn>
          <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {VALUES.map((v, i) => (
              <StaggerItem key={i} className="card-glow p-8 rounded-2xl text-center group">
                <div className="icon-badge w-14 h-14 text-2xl mx-auto mb-5">{v.icon}</div>
                <h3 className="text-theme font-bold text-xl mb-2">{v.title}</h3>
                <p className="text-muted-theme text-sm leading-relaxed">{v.text}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>
    </main>
  );
};

export default AboutPage;
