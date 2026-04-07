'use client';

import { FormEvent, useState } from 'react';
import {
  FaClock,
  FaEnvelope,
  FaMapMarkerAlt,
  FaPaperPlane,
  FaPhone,
} from 'react-icons/fa';
import sileoToast from '@/lib/utils/sileo-toast';
import { http } from '@/lib/http/client';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';

const CONTACT_INFO = [
  {
    icon: <FaEnvelope />,
    label: 'Email Us',
    value: 'contact@transpoguide.com',
    href: 'mailto:contact@transpoguide.com',
  },
  {
    icon: <FaPhone />,
    label: 'Call Us',
    value: '+63 (912) 345-6789',
    href: 'tel:+639123456789',
  },
  {
    icon: <FaMapMarkerAlt />,
    label: 'Visit Us',
    value: 'Isabel Integrated Bus Terminal, Leyte',
    href: '#',
  },
  {
    icon: <FaClock />,
    label: 'Office Hours',
    value: 'Mon - Fri, 8:00 AM - 5:00 PM',
    href: null,
  },
];

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());

const ContactPage = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setSubject('');
    setMessage('');
    setWebsite('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      sileoToast.warning({
        title: 'Missing name',
        description: 'Please enter your first and last name.',
      });
      return;
    }

    if (!isValidEmail(email)) {
      sileoToast.warning({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
      });
      return;
    }

    if (!subject.trim()) {
      sileoToast.warning({
        title: 'Missing subject',
        description: 'Please enter the message subject.',
      });
      return;
    }

    if (!message.trim()) {
      sileoToast.warning({
        title: 'Missing message',
        description: 'Please enter your message.',
      });
      return;
    }

    setSubmitting(true);
    const loadingToast = sileoToast.loading({ title: 'Sending message...' });

    try {
      await http.post('/api/contact', {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          subject: subject.trim(),
          message: message.trim(),
          website: website.trim(),
      });

      sileoToast.dismiss(loadingToast);

      sileoToast.success({
        title: 'Message sent',
        description: "We've received your message and will get back to you soon.",
      });
      resetForm();
    } catch (error) {
      sileoToast.dismiss(loadingToast);
      sileoToast.error({
        title: 'Message not sent',
        description: error instanceof Error ? error.message : 'Please try again later.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <section className="relative pt-40 pb-20 px-6">
        <FadeIn className="max-w-2xl mx-auto text-center">
          <div className="section-badge mx-auto mb-6">Get In Touch</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
            We&apos;d Love to{' '}
            <span className="text-gradient" style={{ fontStyle: 'italic' }}>
              Hear From You
            </span>
          </h1>
          <p className="mt-5 text-muted-theme text-lg">
            Whether you have questions, feedback, or need assistance - our team is
            here to help.
          </p>
        </FadeIn>
      </section>

      <section className="py-16 px-6 pb-28">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-10">
          <FadeIn className="lg:col-span-2 flex flex-col gap-4">
            <Stagger className="flex flex-col gap-4">
              {CONTACT_INFO.map((item, i) => (
                <StaggerItem key={i}>
                  <div className="card-glow p-5 rounded-2xl flex items-center gap-5 group">
                    <div className="icon-badge">{item.icon}</div>
                    <div>
                      <p className="text-muted-theme text-xs font-semibold uppercase tracking-wider">
                        {item.label}
                      </p>
                      {item.href ? (
                        <a
                          href={item.href}
                          className="text-theme text-sm font-medium hover:text-[var(--primary)] transition-colors"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <p className="text-theme text-sm font-medium">{item.value}</p>
                      )}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <div className="card-glow p-5 rounded-2xl h-40 flex items-center justify-center group">
              <div className="text-center">
                <FaMapMarkerAlt
                  className="text-3xl mx-auto mb-2"
                  style={{ color: 'var(--primary)' }}
                />
                <p className="text-muted-theme text-sm">Isabel, Leyte</p>
                <a
                  href="https://maps.google.com/?q=Isabel+Leyte"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold hover:underline mt-1 inline-block"
                  style={{ color: 'var(--primary)' }}
                >
                  Open in Google Maps -&gt;
                </a>
              </div>
            </div>
          </FadeIn>

          <FadeIn className="lg:col-span-3" delay={0.1}>
            <div className="card-glow p-8 rounded-2xl h-full">
              <h2 className="text-theme font-bold text-2xl mb-2">Send Us a Message</h2>
              <p className="text-muted-theme text-sm mb-7">
                Fill out the form and we&apos;ll get back to you within 24 hours.
              </p>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      placeholder="Juan"
                      className="input-dark"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={submitting}
                      maxLength={80}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      placeholder="Dela Cruz"
                      className="input-dark"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={submitting}
                      maxLength={80}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="juan@example.com"
                    className="input-dark"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    maxLength={160}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Subject
                  </label>
                  <input
                    type="text"
                    placeholder="How can we help?"
                    className="input-dark"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={submitting}
                    maxLength={140}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    Message
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Tell us more..."
                    className="input-dark resize-none"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={submitting}
                    maxLength={3000}
                  />
                </div>

                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  autoComplete="off"
                  tabIndex={-1}
                  className="hidden"
                  aria-hidden
                />

                <button
                  type="submit"
                  className="btn-primary w-full group text-base"
                  disabled={submitting}
                  style={submitting ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                >
                  <FaPaperPlane className="group-hover:translate-x-1 transition-transform" />{' '}
                  {submitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>
          </FadeIn>
        </div>
      </section>
    </main>
  );
};

export default ContactPage;
