import { FaMapMarkerAlt, FaPhone, FaEnvelope, FaClock, FaPaperPlane } from 'react-icons/fa';

const CONTACT_INFO = [
  { icon: <FaEnvelope />, label: 'Email Us', value: 'contact@transpoguide.com', href: 'mailto:contact@transpoguide.com' },
  { icon: <FaPhone />, label: 'Call Us', value: '+63 (912) 345-6789', href: 'tel:+639123456789' },
  { icon: <FaMapMarkerAlt />, label: 'Visit Us', value: 'Isabel Integrated Bus Terminal, Leyte', href: '#' },
  { icon: <FaClock />, label: 'Office Hours', value: 'Mon – Fri, 8:00 AM – 5:00 PM', href: null },
];

const ContactPage = () => {
  return (
    <main>
      {/* Hero */}
      <section className="relative pt-40 pb-20 px-6">
        <div className="max-w-2xl mx-auto text-center" data-aos="fade-up">
          <div className="section-badge mx-auto mb-6">Get In Touch</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
            We&apos;d Love to <span className="text-gradient" style={{ fontStyle: 'italic' }}>Hear From You</span>
          </h1>
          <p className="mt-5 text-muted-theme text-lg">
            Whether you have questions, feedback, or need assistance — our team is here to help.
          </p>
        </div>
      </section>

      {/* Main */}
      <section className="py-16 px-6 pb-28">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* Left — info */}
          <div className="lg:col-span-2 flex flex-col gap-4" data-aos="fade-right">
            {CONTACT_INFO.map((item, i) => (
              <div key={i} className="card-glow p-5 rounded-2xl flex items-center gap-5 group">
                <div className="icon-badge">{item.icon}</div>
                <div>
                  <p className="text-muted-theme text-xs font-semibold uppercase tracking-wider">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="text-theme text-sm font-medium hover:text-[var(--primary)] transition-colors">{item.value}</a>
                  ) : (
                    <p className="text-theme text-sm font-medium">{item.value}</p>
                  )}
                </div>
              </div>
            ))}
            {/* Map */}
            <div className="card-glow p-5 rounded-2xl h-40 flex items-center justify-center group">
              <div className="text-center">
                <FaMapMarkerAlt className="text-3xl mx-auto mb-2" style={{ color: 'var(--primary)' }} />
                <p className="text-muted-theme text-sm">Isabel, Leyte</p>
                <a href="https://maps.google.com/?q=Isabel+Leyte" target="_blank" rel="noreferrer"
                  className="text-xs font-semibold hover:underline mt-1 inline-block" style={{ color: 'var(--primary)' }}>
                  Open in Google Maps →
                </a>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-3" data-aos="fade-left">
            <div className="card-glow p-8 rounded-2xl h-full">
              <h2 className="text-theme font-bold text-2xl mb-2">Send Us a Message</h2>
              <p className="text-muted-theme text-sm mb-7">Fill out the form and we&apos;ll get back to you within 24 hours.</p>
              <form className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">First Name</label>
                    <input type="text" placeholder="Juan" className="input-dark" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">Last Name</label>
                    <input type="text" placeholder="Dela Cruz" className="input-dark" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">Email</label>
                  <input type="email" placeholder="juan@example.com" className="input-dark" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">Subject</label>
                  <input type="text" placeholder="How can we help?" className="input-dark" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">Message</label>
                  <textarea rows={5} placeholder="Tell us more..." className="input-dark resize-none" />
                </div>
                <button type="submit" className="btn-primary w-full group text-base">
                  <FaPaperPlane className="group-hover:translate-x-1 transition-transform" /> Send Message
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ContactPage;
