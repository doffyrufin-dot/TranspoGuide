'use client';

import React, { useEffect, useState, ElementType } from 'react';
import { supabase } from '@/utils/supabase/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useTheme } from '@/components/ThemeProvider';
import {
  LayoutDashboard,
  Bus,
  Users,
  Map as MapIcon,
  Calendar,
  FileSpreadsheet,
  Settings,
  LogOut,
  Search,
  Bell,
  Sun,
  Moon,
  Menu,
  ClipboardList,
  ChevronsLeft,
  ChevronsRight,
  X as CloseIcon,
} from 'lucide-react';
import OverviewTab from './tabs/OverviewTab';
import VehicleManagementTab from './tabs/VehicleManagementTab';
import RoutesFaresTab from './tabs/RoutesFaresTab';
import BookingsTab from './tabs/BookingsTab';
import DriversStaffTab from './tabs/DriversStaffTab';
import ApplicationsTab from './tabs/ApplicationsTab';
import ReportsTab from './tabs/ReportsTab';
import playNotificationSound from '@/lib/utils/notification-sound';

const isAbortLikeError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string };
  const name = (e.name || '').toLowerCase();
  const message = (e.message || '').toLowerCase();
  return name.includes('abort') || message.includes('aborted');
};

type DashboardNotification = {
  id: string;
  title: string;
  description: string;
  created_at: string;
};

export default function AdminDashboard() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('Overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [adminName, setAdminName] = useState('Admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminAvatarUrl, setAdminAvatarUrl] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const notifSoundReadyRef = React.useRef(false);
  const notifTopIdRef = React.useRef('');
  const [applicationsFilter, setApplicationsFilter] = useState<
    'All' | 'Pending' | 'Approved' | 'Rejected'
  >('All');
  const [applicationsFilterNonce, setApplicationsFilterNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) {
          window.location.replace('/login');
          return;
        }
        setSessionToken(session.access_token || '');

        let userRow:
          | {
              role: string;
              email: string;
              full_name: string | null;
              avatar_url: string | null;
            }
          | undefined;

        const { data: byId } = await supabase
          .from('tbl_users')
          .select('role, email, full_name, avatar_url')
          .eq('user_id', session.user.id)
          .limit(1);
        if (cancelled) return;
        userRow = byId?.[0];

        if (!userRow && session.user.email) {
          const normalizedEmail = session.user.email.trim().toLowerCase();
          const { data: byEmail } = await supabase
            .from('tbl_users')
            .select('role, email, full_name, avatar_url')
            .ilike('email', normalizedEmail)
            .limit(1);
          if (cancelled) return;
          userRow = byEmail?.[0];
        }

        const role = userRow?.role?.trim()?.toLowerCase();
        if (role === 'admin') {
          setAdminName(
            userRow?.full_name || session.user.user_metadata?.full_name || 'Admin'
          );
          setAdminEmail(userRow?.email || session.user.email || '');
          setAdminAvatarUrl(
            userRow?.avatar_url || session.user.user_metadata?.avatar_url || ''
          );
          setAuthChecking(false);
        } else {
          window.location.replace('/login');
        }
      } catch (error) {
        if (cancelled || isAbortLikeError(error)) return;
        setAuthChecking(false);
      }
    };
    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const syncToken = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setSessionToken(session?.access_token || '');
    };

    void syncToken();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        setSessionToken(session?.access_token || '');
        if (!session) {
          window.location.replace('/login');
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

  const handleNavClick = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const loadNotifications = async (silent = false) => {
    if (!sessionToken) return;
    try {
      const res = await fetch('/api/admin/notifications', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load notifications.');
      }
      const nextNotifications = (data.notifications || []) as DashboardNotification[];
      const nextTopId = String(nextNotifications[0]?.id || '').trim();
      if (
        notifSoundReadyRef.current &&
        nextTopId &&
        nextTopId !== notifTopIdRef.current
      ) {
        playNotificationSound();
      }
      if (!notifSoundReadyRef.current) {
        notifSoundReadyRef.current = true;
      }
      notifTopIdRef.current = nextTopId;
      setNotifications(nextNotifications);
      if (!notifOpen) {
        setNotifUnreadCount(Number(data.unreadCount || 0));
      }
    } catch {
      // silent fail
    }
  };

  useEffect(() => {
    if (!sessionToken) return;
    void loadNotifications(false);
    const timer = window.setInterval(() => {
      void loadNotifications(true);
    }, 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, notifOpen]);

  const formatNotifTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-PH');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Overview':
        return <OverviewTab currentTheme={theme} accessToken={sessionToken} />;
      case 'Routes':
        return <RoutesFaresTab />;
      case 'Vans':
        return <VehicleManagementTab accessToken={sessionToken} />;
      case 'Bookings':
        return <BookingsTab accessToken={sessionToken} />;
      case 'Drivers':
        return <DriversStaffTab accessToken={sessionToken} />;
      case 'Reports':
        return <ReportsTab accessToken={sessionToken} />;
      case 'Applications':
        return (
          <ApplicationsTab
            initialFilter={applicationsFilter}
            filterNonce={applicationsFilterNonce}
          />
        );
      default:
        return (
          <div className="admin-tab p-10 text-center opacity-60">
            <h2 className="text-xl font-bold text-theme">Coming Soon</h2>
            <p className="text-muted-theme text-sm mt-2">
              This feature is under development
            </p>
          </div>
        );
    }
  };

  if (authChecking) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: 'var(--tg-bg)' }}
      >
        <svg
          className="animate-spin h-8 w-8"
          style={{ color: 'var(--primary)' }}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--tg-bg)' }}>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'} flex flex-col transform transition-all duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          background: 'var(--tg-bg-alt)',
          borderRight: '1px solid var(--tg-border)',
          overflow: 'visible',
        }}
      >
        <div
          className={`p-4 ${isSidebarCollapsed ? 'md:px-3' : 'md:px-6'} flex justify-between items-center`}
          style={{ borderBottom: '1px solid var(--tg-border)' }}
        >
          {isSidebarCollapsed ? (
            <div />
          ) : (
            <div>
              <h1 className="text-xl font-bold text-theme">
                Transpo<span style={{ color: 'var(--primary)' }}>Guide</span>
              </h1>
              <p
                className="text-xs mt-1 font-semibold uppercase tracking-wider"
                style={{ color: 'var(--primary)' }}
              >
                Admin Panel
              </p>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden md:flex relative group p-1.5 rounded-lg text-muted-theme hover:text-theme transition cursor-pointer"
            >
              {isSidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              <span
                className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold
                opacity-0 -translate-x-1 scale-95 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 z-[120]"
                style={{
                  background: 'var(--tg-card)',
                  color: 'var(--tg-text)',
                  border: '1px solid var(--tg-border)',
                  boxShadow: 'var(--tg-shadow)',
                }}
              >
                {isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              </span>
            </button>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-1 rounded-lg text-muted-theme hover:text-theme transition"
            >
              <CloseIcon size={20} />
            </button>
          </div>
        </div>

        <nav
          className={`flex-1 p-4 ${isSidebarCollapsed ? 'md:px-2' : ''} space-y-1 overflow-visible`}
        >
          {[
            { icon: LayoutDashboard, label: 'Overview', tab: 'Overview' },
            { icon: Bus, label: 'Manage Vehicles', tab: 'Vans' },
            { icon: Calendar, label: 'Bookings', tab: 'Bookings' },
            { icon: Users, label: 'Drivers', tab: 'Drivers' },
            { icon: MapIcon, label: 'Routes & Fares', tab: 'Routes' },
            { icon: ClipboardList, label: 'Applications', tab: 'Applications' },
            { icon: FileSpreadsheet, label: 'Reports', tab: 'Reports' },
            { icon: Settings, label: 'Settings', tab: 'Settings' },
          ].map((item) => (
            <SidebarItem
              key={item.tab}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.tab}
              collapsed={isSidebarCollapsed}
              onClick={() => handleNavClick(item.tab)}
            />
          ))}
        </nav>

        <div className={`p-4 ${isSidebarCollapsed ? 'md:px-2' : ''}`} style={{ borderTop: '1px solid var(--tg-border)' }}>
          {!isSidebarCollapsed && (
            <div className="mb-3 px-2">
              <p className="text-theme text-sm font-semibold truncate">{adminName}</p>
              <p className="text-muted-theme text-xs truncate">{adminEmail}</p>
            </div>
          )}
          <button
            onClick={toggleTheme}
            title={isSidebarCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : ''}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center relative group' : 'gap-3'} w-full p-2.5 rounded-xl text-muted-theme hover:text-theme transition cursor-pointer mb-1`}
            style={{ background: 'transparent' }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {!isSidebarCollapsed && (
              <span className="text-sm font-medium">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            )}
            {isSidebarCollapsed && (
              <span
                className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold
                opacity-0 -translate-x-1 scale-95 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 z-[120]"
                style={{
                  background: 'var(--tg-card)',
                  color: 'var(--tg-text)',
                  border: '1px solid var(--tg-border)',
                  boxShadow: 'var(--tg-shadow)',
                }}
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            )}
          </button>
          <button
            onClick={handleSignOut}
            title={isSidebarCollapsed ? 'Logout' : ''}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center relative group' : 'gap-3'} w-full p-2.5 rounded-xl text-muted-theme hover:text-theme transition cursor-pointer`}
            style={{ background: 'transparent' }}
          >
            <LogOut size={18} />
            {!isSidebarCollapsed && <span className="text-sm font-medium">Logout</span>}
            {isSidebarCollapsed && (
              <span
                className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold
                opacity-0 -translate-x-1 scale-95 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 z-[120]"
                style={{
                  background: 'var(--tg-card)',
                  color: 'var(--tg-text)',
                  border: '1px solid var(--tg-border)',
                  boxShadow: 'var(--tg-shadow)',
                }}
              >
                Logout
              </span>
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        <header
          className="px-4 md:px-6 py-4 flex justify-between items-center shrink-0"
          style={{ borderBottom: '1px solid var(--tg-border)', background: 'var(--tg-bg)' }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl text-muted-theme hover:text-theme transition"
              style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg md:text-xl font-bold text-theme truncate">{activeTab}</h2>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative hidden sm:block">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none"
                size={16}
                style={{ color: 'var(--tg-muted)' }}
              />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-4 py-2 text-sm w-56 rounded-xl text-theme placeholder:text-muted-theme outline-none transition"
                style={{
                  background: 'var(--tg-bg-alt)',
                  border: '1px solid var(--tg-border)',
                  color: 'var(--tg-text)',
                }}
              />
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen((prev) => {
                    const next = !prev;
                    if (next) setNotifUnreadCount(0);
                    return next;
                  });
                }}
                className="p-2 rounded-xl relative transition hover:bg-[var(--tg-subtle)]"
                style={{ color: 'var(--tg-muted)' }}
                title="Notifications"
              >
                <Bell size={18} />
                {notifUnreadCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                    style={{ background: '#ef4444' }}
                  >
                    {notifUnreadCount > 9 ? '9+' : notifUnreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close notifications"
                    onClick={() => setNotifOpen(false)}
                    className="sm:hidden fixed inset-0 z-[210] bg-black/25"
                  />
                  <div
                    className="fixed left-3 right-3 top-[72px] max-h-[65vh] overflow-y-auto rounded-2xl z-[220] sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-[320px] sm:max-h-[380px]"
                    style={{
                      background: 'var(--tg-card)',
                      border: '1px solid var(--tg-border)',
                      boxShadow: 'var(--tg-shadow)',
                    }}
                  >
                    <div
                      className="px-4 py-3 text-sm font-semibold text-theme"
                      style={{ borderBottom: '1px solid var(--tg-border)' }}
                    >
                      Notifications
                    </div>
                    <div className="p-2">
                      {notifications.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-muted-theme">
                          No notifications.
                        </p>
                      ) : (
                        notifications.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTab('Applications');
                              setApplicationsFilter('Pending');
                              setApplicationsFilterNonce((prev) => prev + 1);
                              setNotifOpen(false);
                              setIsSidebarOpen(false);
                            }}
                            className="w-full text-left p-2 rounded-xl mb-1 cursor-pointer transition hover:opacity-90"
                            style={{ background: 'var(--tg-bg-alt)' }}
                          >
                            <p className="text-sm font-semibold text-theme">{item.title}</p>
                            <p className="text-xs text-muted-theme">{item.description}</p>
                            <p className="text-[11px] text-muted-theme mt-1">
                              {formatNotifTime(item.created_at)}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <img
              src={adminAvatarUrl?.trim() || '/images/profile.png'}
              alt="Admin avatar"
              className="w-8 h-8 rounded-xl object-cover"
              onError={(e) => {
                e.currentTarget.src = '/images/profile.png';
              }}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">{renderContent()}</div>
      </main>
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: ElementType;
  label: string;
  active: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : ''}
      className={`flex items-center ${collapsed ? 'justify-center relative group' : 'gap-3'} w-full p-3 rounded-xl transition-all cursor-pointer`}
      style={
        active
          ? {
              background: 'var(--tg-subtle)',
              color: 'var(--primary)',
              borderLeft: collapsed ? undefined : '3px solid var(--primary)',
              boxShadow: collapsed ? 'inset 0 0 0 1px var(--primary)' : undefined,
            }
          : { color: 'var(--tg-muted)' }
      }
    >
      <Icon size={18} />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
      {collapsed && (
        <span
          className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold
          opacity-0 -translate-x-1 scale-95 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 z-[120]"
          style={{
            background: 'var(--tg-card)',
            color: 'var(--tg-text)',
            border: '1px solid var(--tg-border)',
            boxShadow: 'var(--tg-shadow)',
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}
