'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { FaArrowRight, FaBars, FaTimes } from 'react-icons/fa';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/route', label: 'Routes' },
  { href: '/reservation', label: 'Reservation' },
  { href: '/contact', label: 'Contact' },
];

const Navbar = () => {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? 'var(--tg-nav-bg)' : 'transparent',
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
          borderBottom: scrolled ? '1px solid var(--tg-nav-border)' : '1px solid transparent',
          boxShadow: scrolled ? 'var(--tg-shadow)' : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex items-center justify-between h-[72px]">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image src="/icons/transpoguide-mark.svg" alt="TranspoGuide" width={28} height={28} />
            <span className="text-lg font-bold text-theme">
              Transpo<span className="text-gradient">Guide</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link relative px-4 py-2 text-sm font-medium transition-colors duration-200 rounded-lg"
                style={{ color: isActive(link.href) ? 'var(--primary)' : 'var(--tg-muted)' }}
              >
                {link.label}
                {/* Animated underline */}
                <span
                  className={`nav-link-bar absolute bottom-0.5 left-1/2 h-[2px] rounded-full transition-all duration-300 ${isActive(link.href) ? 'active' : ''}`}
                  style={{
                    background: 'var(--primary)',
                    transform: 'translateX(-50%)',
                  }}
                />
              </Link>
            ))}
          </div>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className="btn-primary text-sm group">
              Login <FaArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Mobile right */}
          <div className="flex md:hidden items-center gap-2.5">
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="theme-toggle"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <FaTimes size={16} /> : <FaBars size={16} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className="fixed inset-0 z-40 md:hidden transition-all duration-300"
        style={{
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? 'auto' : 'none',
          background: 'var(--tg-nav-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div
          className="flex flex-col items-center justify-center h-full gap-2 transition-transform duration-300"
          style={{ transform: mobileOpen ? 'translateY(0)' : 'translateY(-20px)' }}
        >
          {NAV_LINKS.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="text-2xl font-bold py-3 px-8 rounded-xl transition-all duration-200"
              style={{
                color: isActive(link.href) ? 'var(--primary)' : 'var(--tg-text)',
                background: isActive(link.href) ? 'var(--tg-subtle)' : 'transparent',
                transitionDelay: mobileOpen ? `${i * 50}ms` : '0ms',
              }}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4">
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="btn-primary text-base group"
            >
              Login <FaArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
