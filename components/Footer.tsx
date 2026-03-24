'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FaFacebook, FaTwitter, FaInstagram, FaMapMarkerAlt, FaPhone, FaEnvelope } from 'react-icons/fa';

const QUICK_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About Us' },
  { href: '/route', label: 'Routes' },
  { href: '/reservation', label: 'Reservation' },
  { href: '/contact', label: 'Contact' },
];

const SOCIALS = [
  { icon: <FaFacebook />, label: 'Facebook', href: '#' },
  { icon: <FaTwitter />, label: 'Twitter', href: '#' },
  { icon: <FaInstagram />, label: 'Instagram', href: '#' },
];

const Footer = () => {
  return (
    <footer style={{ borderTop: '1px solid var(--tg-border)', background: 'var(--tg-bg)' }}>
      <div className="max-w-7xl mx-auto px-6 md:px-10 pt-14 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <Image src="/icons/transpoguide-mark.svg" alt="Logo" width={28} height={28} />
              <span className="text-lg font-bold text-theme">Transpo<span className="text-gradient">Guide</span></span>
            </Link>
            <p className="text-muted-theme text-sm leading-relaxed">
              Your smart solution for public transportation. Find routes, compare fares, and reserve seats effortlessly.
            </p>
            <div className="flex gap-2.5 mt-5">
              {SOCIALS.map((s) => (
                <Link key={s.label} href={s.href} aria-label={s.label}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-white transition-all duration-200"
                  style={{ background: 'var(--primary)' }}>
                  {s.icon}
                </Link>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-theme font-semibold mb-4 text-sm">Explore</h3>
            <ul className="space-y-2.5">
              {QUICK_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-theme text-sm hover:text-[var(--primary)] transition-colors">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-theme font-semibold mb-4 text-sm">Platform</h3>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2 text-muted-theme text-sm">
                <FaEnvelope style={{ color: 'var(--primary)' }} size={12} /> contact@transpoguide.com
              </li>
              <li className="flex items-center gap-2 text-muted-theme text-sm">
                <FaPhone style={{ color: 'var(--primary)' }} size={12} /> +63 (912) 345-6789
              </li>
              <li className="flex items-center gap-2 text-muted-theme text-sm">
                <FaMapMarkerAlt style={{ color: 'var(--primary)' }} size={12} /> Isabel, Leyte
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="text-theme font-semibold mb-4 text-sm">Join our Community</h3>
            <p className="text-muted-theme text-sm mb-4">Connect with us for updates, tips, and community highlights.</p>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <input type="email" placeholder="your@email.com" className="input-dark text-sm flex-1 min-w-0" />
              <button type="submit" className="btn-primary text-sm px-4 shrink-0">Go</button>
            </form>
          </div>
        </div>

        <div className="divider" />

        <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-muted-theme text-xs">
          <div className="flex gap-5">
            <Link href="#" className="hover:text-[var(--primary)] transition-colors">Terms & Conditions</Link>
            <Link href="#" className="hover:text-[var(--primary)] transition-colors">Privacy Policy</Link>
          </div>
          <span>© {new Date().getFullYear()} TranspoGuide. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
