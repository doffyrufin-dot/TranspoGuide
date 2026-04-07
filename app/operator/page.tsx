'use client';

import React, { useState, useEffect, useMemo, useCallback, ElementType } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import type { AuthChangeEvent, RealtimeChannel, Session } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase/client';
import { useTheme } from '@/components/ThemeProvider';
import sileoToast from '@/lib/utils/sileo-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  fetchOperatorBoardingPassengers,
  fetchOperatorChatConversations,
  fetchOperatorUnreadChatCount,
  fetchOperatorPaymentHistory,
  fetchOperatorReservationMessages,
  fetchOperatorReservations,
  type OperatorBoardingPassenger,
  type OperatorBoardingQueueInfo,
  sendOperatorReservationMessage,
  updateOperatorReservationStatus,
  type OperatorReservationMessage,
  type OperatorPaymentRecord,
  type OperatorReservationRecord,
} from '@/lib/services/operator.services';
import {
  fetchActiveQueue,
  type QueueEntry,
} from '@/lib/services/queue.services';
import {
  CalendarCheck,
  Bus,
  Users,
  Wallet,
  Settings,
  LogOut,
  Bell,
  Check,
  X,
  Phone,
  Clock,
  User,
  MapPin,
  Menu,
  TrendingUp,
  X as CloseIcon,
  Sun,
  Moon,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  SendHorizontal,
  Smile,
} from 'lucide-react';

const LeafletMapContainer = dynamic<any>(
  () => import('react-leaflet').then((m) => m.MapContainer as any),
  { ssr: false }
);
const LeafletTileLayer = dynamic<any>(
  () => import('react-leaflet').then((m) => m.TileLayer as any),
  { ssr: false }
);
const LeafletMarker = dynamic<any>(
  () => import('react-leaflet').then((m) => m.Marker as any),
  { ssr: false }
);
const LeafletPopup = dynamic<any>(
  () => import('react-leaflet').then((m) => m.Popup as any),
  { ssr: false }
);

const isAbortLikeError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string };
  const name = (e.name || '').toLowerCase();
  const message = (e.message || '').toLowerCase();
  return name.includes('abort') || message.includes('aborted');
};

const CHAT_UNREAD_REFRESH_MS = 30000;
const CHAT_LIST_REFRESH_MS = 10000;
const CHAT_THREAD_REFRESH_MS = 10000;

type DashboardNotification = {
  id: string;
  title: string;
  description: string;
  created_at: string;
};

type OperatorSeatMapItem = {
  seatLabel: string;
  status: 'available' | 'locked' | 'reserved';
  passengerName: string | null;
  reservationId: string | null;
  source: 'reservation' | 'walk_in' | null;
};

export default function OperatorDashboard() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [activeView, setActiveView] = useState('Reservations');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [operatorName, setOperatorName] = useState('Operator');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorAvatarUrl, setOperatorAvatarUrl] = useState('');
  const [operatorUserId, setOperatorUserId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) { window.location.replace('/login'); return; }
        setSessionToken(session.access_token || '');
        setOperatorUserId(session.user.id || '');

        const { data: userRows } = await supabase
          .from('tbl_users')
          .select('role, email, full_name, avatar_url')
          .eq('user_id', session.user.id)
          .limit(1);
        if (cancelled) return;

        const role = userRows?.[0]?.role?.trim()?.toLowerCase();

        const { data: appRows } = await supabase
          .from('tbl_operator_applications')
          .select('status')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (cancelled) return;

        const status = appRows?.[0]?.status?.trim()?.toLowerCase();

        if (status === 'pending' || status === 'rejected') {
          window.location.replace(`/login?status=${status}`);
          return;
        }

        if (role === 'admin') {
          window.location.replace('/admin');
          return;
        }

        if (role !== 'operator' && status !== 'approved') {
          window.location.replace('/login');
          return;
        }

        const userRow = userRows?.[0];
        if (userRow || session.user.email) {
          setOperatorName(
            userRow?.full_name ||
              session.user.user_metadata?.full_name ||
              'Operator'
          );
          setOperatorEmail(userRow?.email || session.user.email || '');
          setOperatorAvatarUrl(
            userRow?.avatar_url ||
              session.user.user_metadata?.avatar_url ||
              ''
          );
        }
        setAuthChecking(false);
      } catch (error) {
        if (cancelled) return;
        // Abort errors happen during fast route changes; don't leave spinner stuck.
        if (isAbortLikeError(error)) {
          setAuthChecking(false);
          return;
        }
        setAuthChecking(false);
      }
    };
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
      if (session?.access_token) {
        setSessionToken(session.access_token);
        setOperatorUserId(session.user?.id || '');
        return;
      }

      if (_event === 'SIGNED_OUT') {
        setSessionToken('');
        setOperatorUserId('');
        window.location.replace('/login');
      }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

  const handleNavClick = (view: string) => {
    setActiveView(view);
    setIsSidebarOpen(false);
  };

  const loadNotifications = useCallback(async (silent = false) => {
    if (!sessionToken) return;
    try {
      const res = await fetch('/api/operator/notifications', {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load notifications.');
      }
      setNotifications((data.notifications || []) as DashboardNotification[]);
      if (!notifOpen) {
        setNotifUnreadCount(Number(data.unreadCount || 0));
      }
    } catch {
      // silent fail for bell data
    }
  }, [sessionToken, notifOpen]);

  useEffect(() => {
    if (!sessionToken) return;
    void loadNotifications(false);
    const timer = window.setInterval(() => {
      void loadNotifications(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [sessionToken, notifOpen, loadNotifications]);

  useEffect(() => {
    if (!sessionToken || !operatorUserId) return;

    let refreshTimeout: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) return;
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        void loadNotifications(true);
      }, 250);
    };

    const notificationsChannel = supabase
      .channel(`operator-notifications-${operatorUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tbl_reservations',
          filter: `operator_user_id=eq.${operatorUserId}`,
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }
      void supabase.removeChannel(notificationsChannel);
    };
  }, [sessionToken, operatorUserId, loadNotifications]);

  const formatNotifTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-PH');
  };

  const renderContent = () => {
      switch (activeView) {
      case 'Reservations': return <ReservationsContent accessToken={sessionToken} />;
      case 'Passengers':
        return (
          <PassengersContent
            accessToken={sessionToken}
            operatorUserId={operatorUserId}
          />
        );
      case 'MyVehicle':
        return (
          <MyVehicleContent
            accessToken={sessionToken}
            operatorUserId={operatorUserId}
            operatorName={operatorName}
            operatorEmail={operatorEmail}
          />
        );
      case 'Income': return <IncomeHistoryContent accessToken={sessionToken} />;
      default: return (
        <div className="admin-tab p-10 text-center opacity-60">
          <h2 className="text-xl font-bold text-theme">Coming Soon</h2>
          <p className="text-muted-theme text-sm mt-2">This feature is under development</p>
        </div>
      );
    }
  };

  if (authChecking) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--tg-bg)' }}>
        <svg className="animate-spin h-8 w-8" style={{ color: 'var(--primary)' }} viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--tg-bg)' }}>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* â•â•â• SIDEBAR â•â•â• */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'} flex flex-col transform transition-all duration-300 ease-in-out md:relative md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--tg-bg-alt)', borderRight: '1px solid var(--tg-border)', overflow: 'visible' }}>
        <div className={`p-4 ${isSidebarCollapsed ? 'md:px-3' : 'md:px-6'} flex justify-between items-center`} style={{ borderBottom: '1px solid var(--tg-border)' }}>
          {isSidebarCollapsed ? (
            <div />
          ) : (
            <div>
              <h1 className="text-xl font-bold text-theme">
                Transpo<span style={{ color: 'var(--primary)' }}>Guide</span>
              </h1>
              <p className="text-xs mt-1 font-semibold uppercase tracking-wider" style={{ color: '#22c55e' }}>Operator Panel</p>
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
            <button onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-1 rounded-lg text-muted-theme hover:text-theme transition">
              <CloseIcon size={20} />
            </button>
          </div>
        </div>

        <nav className={`flex-1 p-4 ${isSidebarCollapsed ? 'md:px-2' : ''} space-y-1 overflow-visible`}>
          {[
            { icon: Bus, label: 'My Vehicle', tab: 'MyVehicle' },
            { icon: CalendarCheck, label: 'Reservations', tab: 'Reservations' },
            { icon: Users, label: 'Passengers', tab: 'Passengers' },
            { icon: Wallet, label: 'Income & History', tab: 'Income' },
            { icon: Settings, label: 'Settings', tab: 'Settings' },
          ].map((item) => (
            <SidebarItem key={item.tab} icon={item.icon} label={item.label}
              active={activeView === item.tab} collapsed={isSidebarCollapsed} onClick={() => handleNavClick(item.tab)} />
          ))}
        </nav>

        <div className={`p-4 ${isSidebarCollapsed ? 'md:px-2' : ''}`} style={{ borderTop: '1px solid var(--tg-border)' }}>
          {!isSidebarCollapsed && (
          <div className="mb-3 px-2">
            <p className="text-theme text-sm font-semibold truncate">{operatorName}</p>
            <p className="text-muted-theme text-xs truncate">{operatorEmail}</p>
          </div>
          )}
          <button onClick={toggleTheme}
            title={isSidebarCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : ''}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center relative group' : 'gap-3'} w-full p-2.5 rounded-xl text-muted-theme hover:text-theme transition cursor-pointer mb-1`}
            style={{ background: 'transparent' }}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {!isSidebarCollapsed && (
              <span className="text-sm font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
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
          <button onClick={handleSignOut}
            title={isSidebarCollapsed ? 'Logout' : ''}
            className={`flex items-center ${isSidebarCollapsed ? 'justify-center relative group' : 'gap-3'} w-full p-2.5 rounded-xl text-muted-theme hover:text-theme transition cursor-pointer`}
            style={{ background: 'transparent' }}>
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

      {/* â•â•â• MAIN â•â•â• */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        <header className="px-4 md:px-6 py-4 flex justify-between items-center shrink-0"
          style={{ borderBottom: '1px solid var(--tg-border)', background: 'var(--tg-bg)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl text-muted-theme hover:text-theme transition"
              style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
              <Menu size={20} />
            </button>
            <h2 className="text-lg md:text-xl font-bold text-theme truncate">{activeView}</h2>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
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
                            type="button"
                            onClick={() => {
                              setActiveView('Reservations');
                              setNotifOpen(false);
                              setNotifUnreadCount(0);
                            }}
                            className="w-full text-left p-2 rounded-xl mb-1 transition cursor-pointer hover:bg-[var(--tg-subtle)]"
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
            <div className="flex items-center gap-3 pl-3 md:pl-4" style={{ borderLeft: '1px solid var(--tg-border)' }}>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-theme">{operatorName.split(' ')[0]}</p>
                <p className="text-xs text-muted-theme">Operator</p>
              </div>
              <img
                src={operatorAvatarUrl?.trim() || '/images/profile.png'}
                alt="Operator avatar"
                className="w-9 h-9 rounded-xl object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/images/profile.png';
                }}
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">{renderContent()}</div>
        <OperatorChatWidget accessToken={sessionToken} />
      </main>
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SIDEBAR ITEM
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function SidebarItem({ icon: Icon, label, active, collapsed, onClick }: {
  icon: ElementType; label: string; active: boolean; collapsed?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      title={collapsed ? label : ''}
      className={`flex items-center ${collapsed ? 'justify-center relative group' : 'justify-between'} w-full p-3 rounded-xl transition-all cursor-pointer`}
      style={active
        ? {
          background: 'var(--tg-subtle)',
          color: 'var(--primary)',
          borderLeft: collapsed ? undefined : '3px solid var(--primary)',
          boxShadow: collapsed ? 'inset 0 0 0 1px var(--primary)' : undefined,
        }
        : { color: 'var(--tg-muted)' }
      }>
      <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
        <Icon size={18} />
        {!collapsed && <span className="text-sm font-medium">{label}</span>}
      </div>
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

function OperatorChatWidget({ accessToken }: { accessToken: string }) {
  const CHAT_RENDER_LIMIT = 160;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReservationId, setChatReservationId] = useState('');
  const [chatMessages, setChatMessages] = useState<OperatorReservationMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatListLoading, setChatListLoading] = useState(false);
  const [chatMessagesLoading, setChatMessagesLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [unreadThreadCount, setUnreadThreadCount] = useState(0);
  const [unreadByReservation, setUnreadByReservation] = useState<Record<string, number>>({});
  const [pendingReservations, setPendingReservations] = useState<OperatorReservationRecord[]>([]);
  const [pastReservations, setPastReservations] = useState<OperatorReservationRecord[]>([]);
  const chatBodyRef = React.useRef<HTMLDivElement | null>(null);
  const chatRealtimeRef = React.useRef<RealtimeChannel | null>(null);
  const unreadRealtimeRef = React.useRef<RealtimeChannel | null>(null);
  const chatOpenRef = React.useRef(false);
  const activeReservationRef = React.useRef('');
  const quickEmojis = ['😀', '😁', '😂', '😊', '😍', '👍', '🙏', '❤️'];

  const mergeMessages = (
    current: OperatorReservationMessage[],
    incoming: OperatorReservationMessage[]
  ) => {
    const byId = new Map<string, OperatorReservationMessage>();
    [...current, ...incoming].forEach((msg) => {
      byId.set(msg.id, msg);
    });
    return [...byId.values()].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  };

  const allReservations = useMemo(() => {
    const byId = new Map<string, OperatorReservationRecord>();
    const eligibleHistory = pastReservations.filter(
      (row) => String(row.status || '').toLowerCase() === 'confirmed'
    );
    [...pendingReservations, ...eligibleHistory].forEach((row) => {
      byId.set(row.id, row);
    });
    return [...byId.values()].sort((a, b) => {
      const aTime = new Date(
        a.latest_message_at || a.paid_at || a.created_at
      ).getTime();
      const bTime = new Date(
        b.latest_message_at || b.paid_at || b.created_at
      ).getTime();
      return bTime - aTime;
    });
  }, [pendingReservations, pastReservations]);

  const selectedChatReservation = useMemo(
    () => allReservations.find((r) => r.id === chatReservationId) || null,
    [allReservations, chatReservationId]
  );
  const renderedChatMessages = useMemo(() => {
    if (chatMessages.length <= CHAT_RENDER_LIMIT) return chatMessages;
    return chatMessages.slice(-CHAT_RENDER_LIMIT);
  }, [chatMessages, CHAT_RENDER_LIMIT]);

  const formatRelativeTime = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.max(1, Math.floor(diffMs / 60000));
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d`;
  };

  const getInitials = (name?: string | null) => {
    const raw = String(name || '').trim();
    if (!raw) return 'P';
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  };

  const loadReservations = async (silent = false) => {
    if (!accessToken) return;
    try {
      if (!silent) setChatListLoading(true);
      const data = await fetchOperatorChatConversations(accessToken);
      setPendingReservations(data.conversations || []);
      setPastReservations([]);
    } catch (error: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load chat reservations',
          description: error?.message || 'Please try again.',
        });
      }
    } finally {
      if (!silent) setChatListLoading(false);
    }
  };

  const loadUnreadCount = async (silent = true) => {
    if (!accessToken) return;
    try {
      const result = await fetchOperatorUnreadChatCount(accessToken);
      setUnreadThreadCount(Number(result.unreadThreadCount || 0));
      setUnreadByReservation(result.unreadByReservation || {});
    } catch {
      if (!silent) {
        sileoToast.error({
          title: 'Unread chat check failed',
          description: 'Please try again.',
        });
      }
    }
  };

  const loadChat = async (
    reservationId?: string,
    options?: { silent?: boolean }
  ) => {
    const targetId = (reservationId || chatReservationId || '').trim();
    if (!targetId || !accessToken) return;
    const silent = !!options?.silent;
    try {
      if (!silent) setChatMessagesLoading(true);
      const rows = await fetchOperatorReservationMessages({
        accessToken,
        reservationId: targetId,
      });
      setChatMessages(rows || []);
    } catch (error: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load chat',
          description: error?.message || 'Please try again.',
        });
      }
    } finally {
      if (!silent) setChatMessagesLoading(false);
    }
  };

  const handleSendChat = async () => {
    const message = chatInput.trim();
    if (!message || !chatReservationId || !accessToken || chatSending) return;

    const tempId = `tmp-op-${Date.now()}`;
    const tempMessage: OperatorReservationMessage = {
      id: tempId,
      sender_type: 'operator',
      sender_name: 'Operator',
      message,
      created_at: new Date().toISOString(),
    };

    try {
      setChatSending(true);
      setChatMessages((prev) => mergeMessages(prev, [tempMessage]));
      setChatInput('');

      const savedMessage = await sendOperatorReservationMessage({
        accessToken,
        reservationId: chatReservationId,
        senderName: 'Operator',
        message,
      });
      setChatMessages((prev) =>
        mergeMessages(
          prev.filter((m) => m.id !== tempId),
          [savedMessage]
        )
      );
      if (chatRealtimeRef.current) {
        await chatRealtimeRef.current.send({
          type: 'broadcast',
          event: 'new-message',
          payload: {
            reservationId: chatReservationId,
            message: savedMessage,
          },
        });
      }
      setShowEmojiPicker(false);
    } catch (error: any) {
      setChatMessages((prev) => prev.filter((m) => m.id !== tempId));
      setChatInput(message);
      sileoToast.error({
        title: 'Message failed',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setChatSending(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    void loadUnreadCount(true);
    if (chatOpen) return;
    const timer = window.setInterval(() => {
      void loadUnreadCount(true);
    }, CHAT_UNREAD_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    void loadReservations(false);
    void loadUnreadCount(true);
    const timer = window.setInterval(() => {
      void loadReservations(true);
      void loadUnreadCount(true);
    }, CHAT_LIST_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, accessToken]);

  useEffect(() => {
    if (!allReservations.length) {
      setChatReservationId('');
      setChatMessages([]);
      return;
    }
    const currentExists = allReservations.some((r) => r.id === chatReservationId);
    if (!currentExists) {
      setChatReservationId('');
      setChatMessages([]);
    }
  }, [allReservations, chatReservationId]);

  useEffect(() => {
    if (!chatOpen || !chatReservationId) return;
    void loadChat(chatReservationId, { silent: false });

    const channel = supabase
      .channel(`reservation-chat-${chatReservationId}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        'broadcast',
        { event: 'new-message' },
        (payload: {
          payload?: {
            reservationId?: string;
            message?: OperatorReservationMessage;
          };
        }) => {
          const incomingReservationId = (
            payload?.payload?.reservationId || ''
          ).trim();
          if (incomingReservationId !== chatReservationId) return;
          const row = payload?.payload?.message;
          if (!row?.id) return;
          setChatMessages((prev) => mergeMessages(prev, [row]));
        }
      )
      .subscribe();

    chatRealtimeRef.current = channel;

    return () => {
      if (chatRealtimeRef.current === channel) {
        chatRealtimeRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatReservationId, accessToken]);

  useEffect(() => {
    if (!chatOpen || !chatReservationId || !accessToken) return;
    const timer = window.setInterval(() => {
      void loadChat(chatReservationId, { silent: true });
    }, CHAT_THREAD_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatReservationId, accessToken]);

  useEffect(() => {
    if (!chatOpen) setShowEmojiPicker(false);
  }, [chatOpen]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    activeReservationRef.current = chatReservationId;
  }, [chatReservationId]);

  useEffect(() => {
    if (!chatOpen) return;
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [renderedChatMessages, chatOpen]);

  useEffect(() => {
    if (!accessToken) return;

    const channel = supabase
      .channel(`operator-chat-unread-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tbl_reservation_messages',
          filter: 'sender_type=eq.passenger',
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as {
            id?: string;
            reservation_id?: string;
            sender_type?: 'passenger' | 'operator';
            sender_name?: string | null;
            message?: string | null;
            created_at?: string;
          };

          const reservationId = String(row.reservation_id || '').trim();
          if (!reservationId) return;

          if (
            chatOpenRef.current &&
            activeReservationRef.current &&
            activeReservationRef.current === reservationId &&
            row.id &&
            row.message &&
            row.created_at
          ) {
            const messageId = String(row.id);
            const messageText = String(row.message);
            const createdAt = String(row.created_at);
            const senderName = row.sender_name ? String(row.sender_name) : 'Passenger';
            setChatMessages((prev) =>
              mergeMessages(prev, [
                {
                  id: messageId,
                  sender_type: 'passenger',
                  sender_name: senderName,
                  message: messageText,
                  created_at: createdAt,
                },
              ])
            );
          }

          setUnreadByReservation((prev) => {
            const currentUnread = Number(prev[reservationId] || 0);
            const next = { ...prev, [reservationId]: currentUnread + 1 };
            if (currentUnread === 0) {
              setUnreadThreadCount((count) => count + 1);
            }
            return next;
          });

          void loadUnreadCount(true);
          if (chatOpenRef.current) {
            void loadReservations(true);
          }
        }
      )
      .subscribe();

    unreadRealtimeRef.current = channel;

    return () => {
      if (unreadRealtimeRef.current === channel) {
        unreadRealtimeRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  if (!mounted) return null;

  return createPortal(
    <>
      {!chatOpen && (
        <button
          onClick={() => {
            setChatReservationId('');
            setChatOpen(true);
          }}
          className="fixed z-[200] w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition hover:scale-105 cursor-pointer relative"
          style={{
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            background: 'var(--primary)',
            color: '#fff',
          }}
          title="Open reservation chat"
        >
          <MessageCircle size={22} />
          {unreadThreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
              style={{ background: '#ef4444', border: '2px solid var(--tg-bg)' }}
            >
              {unreadThreadCount > 9 ? '9+' : unreadThreadCount}
            </span>
          )}
        </button>
      )}

      {chatOpen && (
        <>
          {!selectedChatReservation && (
            <div
              className="fixed z-[190] w-[calc(100vw-1rem)] sm:w-[360px] max-w-[360px] flex flex-col overflow-hidden rounded-2xl"
              style={{
                position: 'fixed',
                right: '12px',
                bottom: '10px',
                height: 'min(560px, calc(100vh - 20px))',
                background: 'var(--tg-card)',
                border: '1px solid var(--tg-border)',
                boxShadow: 'var(--tg-shadow)',
              }}
            >
              <div
                className="px-4 py-3 border-b"
                style={{
                  borderColor: 'var(--tg-border)',
                  background: 'var(--tg-bg-alt)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-theme font-semibold leading-none">Passenger Chat</p>
                    <p className="text-[11px] text-muted-theme mt-1">Realtime conversations</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void loadReservations(false)}
                      title="Refresh chat list"
                      className="h-8"
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setChatOpen(false);
                        setChatReservationId('');
                      }}
                      title="Close chat"
                      className="h-8 w-8"
                    >
                      <CloseIcon size={16} />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="p-3 pt-2 flex-1 min-h-0">
                <div
                  className="rounded-xl border h-full flex flex-col overflow-hidden"
                  style={{
                    borderColor: 'var(--tg-border)',
                    background: 'var(--tg-bg-alt)',
                  }}
                >
                  <p
                    className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide border-b"
                    style={{ borderColor: 'var(--tg-border)', color: 'var(--tg-muted)' }}
                  >
                    Passenger List
                  </p>
                  <ScrollArea className="flex-1 min-h-0">
                    {chatListLoading && (
                      <p className="px-3 py-3 text-xs text-muted-theme">Loading conversations...</p>
                    )}
                    {!chatListLoading && allReservations.length === 0 && (
                      <p className="px-3 py-3 text-xs text-muted-theme">
                        No chat activity for the current boarding queue.
                      </p>
                    )}
                    <div className="space-y-1.5 p-2">
                      {allReservations.map((r) => {
                        const unread = Number(unreadByReservation[r.id] || 0);
                        const isActive = chatReservationId === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setChatReservationId(r.id);
                              setUnreadByReservation((prev) => ({
                                ...prev,
                                [r.id]: 0,
                              }));
                              if (unread > 0) {
                                setUnreadThreadCount((prev) => Math.max(0, prev - 1));
                              }
                            }}
                            className="w-full rounded-xl px-3 py-2 text-left transition cursor-pointer border"
                            style={{
                              background: isActive ? 'var(--tg-subtle)' : 'transparent',
                              borderColor: isActive ? 'var(--primary)' : 'var(--tg-border)',
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
                                style={{
                                  background: 'rgba(59,130,246,0.15)',
                                  color: 'var(--primary)',
                                  border: '1px solid rgba(59,130,246,0.35)',
                                }}
                              >
                                {getInitials(r.full_name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold text-theme truncate">{r.full_name}</p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {unread > 0 && (
                                      <span
                                        className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                                        style={{ background: '#ef4444' }}
                                      >
                                        {unread > 9 ? '9+' : unread}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-theme">
                                      {formatRelativeTime(r.latest_message_at || r.paid_at || r.created_at)}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[11px] text-muted-theme truncate">{r.route}</p>
                                <p className="text-[11px] text-muted-theme truncate mt-0.5">
                                  {r.latest_message
                                    ? `${r.latest_message_sender === 'operator' ? 'You: ' : ''}${r.latest_message}`
                                    : 'No messages yet'}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}

          {selectedChatReservation && (
            <div
              className="fixed z-[195] w-[calc(100vw-1rem)] sm:w-[390px] max-w-[390px] flex flex-col overflow-hidden right-3 bottom-[10px] rounded-[18px]"
              style={{
                height: 'min(560px, calc(100vh - 20px))',
                background: 'var(--tg-bg-alt)',
                border: '1px solid color-mix(in srgb, var(--tg-border) 80%, #d4d4d8 20%)',
                boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
              }}
            >
              <div
                className="h-14 px-3 border-b flex items-center justify-between gap-2"
                style={{
                  borderColor: 'var(--tg-border)',
                  background: 'var(--tg-card)',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setChatReservationId('')}
                    className="h-8 w-8 rounded-full flex items-center justify-center cursor-pointer transition hover:bg-[var(--tg-subtle)] shrink-0"
                    title="Back to list"
                    style={{ color: 'var(--primary)' }}
                  >
                    <ChevronsLeft size={16} />
                  </button>
                  <div
                    className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: 'rgba(59,130,246,0.15)',
                      color: 'var(--primary)',
                      border: '1px solid rgba(59,130,246,0.35)',
                    }}
                  >
                    {getInitials(selectedChatReservation.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-theme font-semibold truncate max-w-[180px]">
                      {selectedChatReservation.full_name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: 'var(--primary)' }}
                      />
                      <span className="text-[11px] text-muted-theme">Online</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setChatOpen(false);
                    setChatReservationId('');
                  }}
                  title="Close chat"
                  className="h-8 w-8 rounded-full flex items-center justify-center cursor-pointer transition hover:bg-[var(--tg-subtle)] shrink-0"
                  style={{ color: 'var(--tg-muted)' }}
                >
                  <CloseIcon size={17} />
                </button>
              </div>

              <div
                className="flex-1 min-h-0 px-3 py-3"
                style={{ background: 'var(--tg-bg)' }}
              >
                <ScrollArea
                  ref={chatBodyRef}
                  className="h-full rounded-xl p-2.5"
                  style={{
                    background: 'color-mix(in srgb, var(--tg-bg-alt) 90%, #f1f5f9 10%)',
                    border: '1px solid var(--tg-border)',
                  }}
                >
                  {chatMessagesLoading ? (
                    <p className="text-sm text-muted-theme">Loading chat...</p>
                  ) : renderedChatMessages.length === 0 ? (
                    <p className="text-sm text-muted-theme">No messages yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {renderedChatMessages.map((msg) => {
                        const isOperator = msg.sender_type === 'operator';
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[84%] rounded-2xl px-3 py-2.5 ${
                                isOperator ? 'rounded-br-md' : 'rounded-bl-md'
                              }`}
                              style={{
                                background: isOperator ? 'var(--primary)' : 'var(--tg-card)',
                                color: isOperator ? '#ffffff' : 'var(--tg-text)',
                                border: isOperator ? '1px solid transparent' : '1px solid var(--tg-border)',
                              }}
                            >
                              <p
                                className="text-sm whitespace-pre-wrap break-words"
                                style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                              >
                                {msg.message}
                              </p>
                              <p
                                className="text-[10px] mt-1"
                                style={{ color: isOperator ? 'rgba(255,255,255,0.78)' : 'var(--tg-muted)' }}
                              >
                                {new Date(msg.created_at).toLocaleString('en-PH')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div
                className="px-2.5 py-2 border-t"
                style={{ borderColor: 'var(--tg-border)', background: 'var(--tg-card)' }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker((prev) => !prev)}
                      title="Add emoji"
                      className="h-9 w-9 rounded-full flex items-center justify-center cursor-pointer transition hover:bg-[var(--tg-subtle)]"
                      style={{ color: 'var(--primary)' }}
                    >
                      <Smile size={16} />
                    </button>
                    {showEmojiPicker && (
                      <div
                        className="absolute bottom-11 left-0 w-48 z-[210] p-2 rounded-xl border"
                        style={{
                          background: 'var(--tg-card)',
                          borderColor: 'var(--tg-border)',
                          boxShadow: 'var(--tg-shadow)',
                        }}
                      >
                        <div className="grid grid-cols-4 gap-1">
                          {quickEmojis.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setChatInput((prev) => `${prev}${emoji}`);
                                setShowEmojiPicker(false);
                              }}
                              className="text-lg p-1 rounded-md hover:bg-[var(--tg-subtle)] transition cursor-pointer"
                              title={emoji}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSendChat();
                      }
                    }}
                    placeholder="Aa"
                    className="flex-1 h-10 rounded-full border text-sm"
                    style={{
                      borderColor: 'var(--tg-border)',
                      background: 'var(--tg-bg-alt)',
                    }}
                    disabled={!chatReservationId}
                  />

                  <button
                    onClick={() => void handleSendChat()}
                    disabled={!chatReservationId || !chatInput.trim() || chatSending}
                    className="h-9 w-9 rounded-full flex items-center justify-center cursor-pointer transition disabled:opacity-50"
                    style={{ background: 'var(--primary)', color: '#fff' }}
                    title="Send"
                  >
                    <SendHorizontal size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>,
    document.body
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RESERVATIONS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ReservationsContent({ accessToken }: { accessToken: string }) {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [pendingReservations, setPendingReservations] = useState<OperatorReservationRecord[]>([]);
  const [pastReservations, setPastReservations] = useState<OperatorReservationRecord[]>([]);

  const formatPeso = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const loadReservations = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const data = await fetchOperatorReservations(accessToken);
      setPendingReservations(data.pending || []);
      setPastReservations(data.history || []);
    } catch (error: any) {
      sileoToast.error({
        title: 'Failed to load reservations',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleAction = async (reservationId: string, status: 'confirmed' | 'rejected') => {
    if (!accessToken || !reservationId || actionLoadingId) return;
    try {
      setActionLoadingId(reservationId);
      await updateOperatorReservationStatus({
        accessToken,
        reservationId,
        status,
      });
      sileoToast.success({
        title: status === 'confirmed' ? 'Reservation confirmed' : 'Reservation rejected',
      });
      await loadReservations();
    } catch (error: any) {
      sileoToast.error({
        title: 'Action failed',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setActionLoadingId('');
    }
  };


  return (
    <div className="admin-tab space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Pending Approval', value: `${pendingReservations.length}`, icon: <Clock size={18} />, color: '#f59e0b' },
          {
            label: 'Confirmed',
            value: `${pastReservations.filter((r) => (r.status || '').toLowerCase() === 'confirmed').length}`,
            icon: <Check size={18} />,
            color: '#22c55e',
          },
          {
            label: "Today's Income",
            value: formatPeso(
              pastReservations
                .filter((r) => (r.status || '').toLowerCase() === 'confirmed')
                .reduce((sum, r) => {
                  const date = new Date(r.paid_at || r.created_at);
                  const now = new Date();
                  const sameDay =
                    date.getFullYear() === now.getFullYear() &&
                    date.getMonth() === now.getMonth() &&
                    date.getDate() === now.getDate();
                  return sameDay ? sum + Number(r.amount_due || 0) : sum;
                }, 0)
            ),
            icon: <TrendingUp size={18} />,
            color: 'var(--primary)',
          },
        ].map((stat, i) => (
          <div key={i} className="card-glow p-4 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${stat.color}18`, color: stat.color }}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-muted-theme font-medium">{stat.label}</p>
              <h3 className="text-xl font-extrabold text-theme">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {(['pending', 'history'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer
              ${activeTab === tab ? 'text-white' : 'text-muted-theme'}`}
            style={activeTab === tab ? { background: 'var(--primary)' }
              : { background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
            {tab === 'pending' ? 'Incoming Requests' : 'History'}
          </button>
        ))}
      </div>

      <div className="hidden md:block card-glow rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--tg-border)' }}>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Passenger</th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Route</th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  {activeTab === 'pending' ? 'Payment Time' : 'Updated'}
                </th>
                <th className="text-center p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Seats / Amount</th>
                <th className="text-right p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-6 text-muted-theme" colSpan={5}>Loading reservations...</td>
                </tr>
              ) : activeTab === 'pending' ? (
                pendingReservations.length === 0 ? (
                  <tr>
                    <td className="p-6 text-muted-theme" colSpan={5}>No pending approvals.</td>
                  </tr>
                ) : (
                  pendingReservations.map((res) => (
                    <tr key={res.id} style={{ borderBottom: '1px solid var(--tg-border)' }}
                      className="hover:bg-[var(--tg-subtle)] transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-muted-theme" />
                          <div>
                            <p className="text-theme font-semibold">{res.full_name}</p>
                            <p className="text-muted-theme text-xs flex items-center gap-1"><Phone size={11} /> {res.contact_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <MapPin size={13} style={{ color: 'var(--primary)' }} />
                            <span className="text-theme font-medium">{res.route}</span>
                          </div>
                          <p className="text-xs text-muted-theme">
                            Pickup: {res.pickup_location || 'Not provided'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>
                          {new Date(res.paid_at || res.created_at).toLocaleString('en-PH')}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <p className="text-theme font-bold">{Number(res.seat_count || 0)} seat(s)</p>
                        <p className="text-muted-theme text-xs">{formatPeso(Number(res.amount_due || 0))}</p>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={actionLoadingId === res.id}
                            onClick={() => handleAction(res.id, 'rejected')}
                            className="p-2 rounded-xl cursor-pointer transition hover:scale-105 disabled:opacity-50"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                            <X size={16} />
                          </button>
                          <button
                            disabled={actionLoadingId === res.id}
                            onClick={() => handleAction(res.id, 'confirmed')}
                            className="btn-primary shadow-none text-xs py-2 px-4 disabled:opacity-50">
                            <Check size={14} /> Confirm
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )
              ) : pastReservations.length === 0 ? (
                <tr>
                  <td className="p-6 text-muted-theme" colSpan={5}>No reservation history yet.</td>
                </tr>
              ) : (
                pastReservations.map((res) => (
                  <tr key={res.id} style={{ borderBottom: '1px solid var(--tg-border)' }}
                    className="hover:bg-[var(--tg-subtle)] transition-colors">
                    <td className="p-4">
                      <p className="text-theme font-semibold">{res.full_name}</p>
                    </td>
                    <td className="p-4">
                      <span className="text-theme">{res.route}</span>
                    </td>
                    <td className="p-4">
                        <span className="text-muted-theme text-xs">
                        {new Date(res.paid_at || res.created_at).toLocaleString('en-PH')}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-theme font-medium">{formatPeso(Number(res.amount_due || 0))}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                        style={(res.status || '').toLowerCase() === 'confirmed'
                          ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                          : { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                        {String(res.status || '').toLowerCase() === 'confirmed' ? 'Confirmed' : 'Rejected'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="card-glow rounded-2xl p-4 text-sm text-muted-theme">
            Loading reservations...
          </div>
        ) : activeTab === 'pending' ? (
          pendingReservations.length === 0 ? (
            <div className="card-glow rounded-2xl p-4 text-sm text-muted-theme">
              No pending approvals.
            </div>
          ) : (
            pendingReservations.map((res) => (
              <div key={res.id} className="card-glow rounded-2xl p-4 space-y-2">
                <p className="text-theme font-semibold">{res.full_name}</p>
                <p className="text-muted-theme text-xs">{res.route}</p>
                <p className="text-muted-theme text-xs">
                  Pickup: {res.pickup_location || 'Not provided'}
                </p>
                <p className="text-muted-theme text-xs">
                  {new Date(res.paid_at || res.created_at).toLocaleString('en-PH')}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-theme text-sm">
                    {Number(res.seat_count || 0)} seat(s) - {formatPeso(Number(res.amount_due || 0))}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={actionLoadingId === res.id}
                      onClick={() => handleAction(res.id, 'rejected')}
                      className="p-2 rounded-lg disabled:opacity-50"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                    >
                      <X size={14} />
                    </button>
                    <button
                      disabled={actionLoadingId === res.id}
                      onClick={() => handleAction(res.id, 'confirmed')}
                      className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            ))
          )
        ) : pastReservations.length === 0 ? (
          <div className="card-glow rounded-2xl p-4 text-sm text-muted-theme">
            No reservation history yet.
          </div>
        ) : (
          pastReservations.map((res) => (
            <div key={res.id} className="card-glow rounded-2xl p-4 space-y-1">
              <p className="text-theme font-semibold">{res.full_name}</p>
              <p className="text-muted-theme text-xs">{res.route}</p>
              <p className="text-theme text-sm">{formatPeso(Number(res.amount_due || 0))}</p>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

function PassengersContent({
  accessToken,
  operatorUserId,
}: {
  accessToken: string;
  operatorUserId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [queueInfo, setQueueInfo] = useState<OperatorBoardingQueueInfo | null>(null);
  const [passengers, setPassengers] = useState<OperatorBoardingPassenger[]>([]);
  const [rowActionLoadingId, setRowActionLoadingId] = useState<string | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([10.9622, 124.6276]);
  const [mapMarker, setMapMarker] = useState<[number, number] | null>(null);
  const [mapReservation, setMapReservation] = useState<OperatorBoardingPassenger | null>(null);

  const formatPeso = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const parseCoordinatesFromText = (value: string): [number, number] | null => {
    const match = value.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return [lat, lng];
  };

  const resolvePickupCoordinates = async (
    pickupLocation: string,
    routeHint: string
  ): Promise<[number, number] | null> => {
    const parsed = parseCoordinatesFromText(pickupLocation);
    if (parsed) return parsed;

    const queryParts = [pickupLocation.trim(), routeHint.trim(), 'Leyte, Philippines'].filter(
      Boolean
    );
    if (queryParts.length === 0) return null;

    const q = encodeURIComponent(queryParts.join(', '));
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`,
      { cache: 'no-store' }
    );
    if (!response.ok) return null;

    const rows = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = rows?.[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
  };

  const loadPassengers = useCallback(async (silent = false) => {
    if (!accessToken) return;
    try {
      if (!silent) setLoading(true);
      const result = await fetchOperatorBoardingPassengers(accessToken);
      setQueueInfo(result.queue || null);
      setPassengers(result.passengers || []);
    } catch (err: unknown) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load passengers',
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      }
      setQueueInfo(null);
      setPassengers([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPassengers(false);
  }, [loadPassengers]);

  useEffect(() => {
    if (!accessToken || !operatorUserId) return;

    let refreshTimeout: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) return;
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        void loadPassengers(true);
      }, 250);
    };

    const reservationsChannel = supabase
      .channel(`operator-passengers-res-${operatorUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tbl_reservations',
          filter: `operator_user_id=eq.${operatorUserId}`,
        },
        scheduleRefresh
      )
      .subscribe();

    const queueChannel = supabase
      .channel(`operator-passengers-queue-${operatorUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tbl_van_queue',
          filter: `operator_user_id=eq.${operatorUserId}`,
        },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }
      void supabase.removeChannel(reservationsChannel);
      void supabase.removeChannel(queueChannel);
    };
  }, [accessToken, operatorUserId, loadPassengers]);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled) return;
      const proto = L.Icon.Default.prototype as { _getIconUrl?: unknown };
      delete proto._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenPickupMap = async (row: OperatorBoardingPassenger) => {
    const pickup = (row.pickup_location || '').trim();
    if (!pickup) {
      sileoToast.warning({
        title: 'Missing pickup location',
        description: 'Passenger has no pickup location yet.',
      });
      return;
    }

    setMapReservation(row);
    setMapModalOpen(true);
    setMapError('');
    setMapLoading(true);
    setMapMarker(null);

    try {
      const coords = await resolvePickupCoordinates(pickup, row.route || queueInfo?.route || '');
      if (!coords) {
        setMapError('Unable to locate this pickup point on the map.');
        return;
      }
      setMapCenter(coords);
      setMapMarker(coords);
    } catch {
      setMapError('Failed to load map coordinates. Please try again.');
    } finally {
      setMapLoading(false);
    }
  };

  const closeMapModal = () => {
    setMapModalOpen(false);
    setMapError('');
    setMapLoading(false);
    setMapMarker(null);
    setMapReservation(null);
  };

  const handlePickedUp = async (row: OperatorBoardingPassenger) => {
    try {
      setRowActionLoadingId(row.id);
      await updateOperatorReservationStatus({
        accessToken,
        reservationId: row.id,
        status: 'picked_up',
      });
      sileoToast.success({
        title: 'Passenger marked as picked up',
        description: `${row.full_name || 'Passenger'} was moved to completed pickup.`,
      });
      await loadPassengers(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      sileoToast.error({
        title: 'Failed to update pickup status',
        description: message,
      });
    } finally {
      setRowActionLoadingId(null);
    }
  };

  return (
    <div className="admin-tab space-y-5">
      <div className="card-glow p-5 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-theme font-bold text-lg">Queue Passengers</h3>
            <p className="text-muted-theme text-sm">
              Latest reservations for your current queued or boarding van
            </p>
          </div>
          <button
            onClick={() => void loadPassengers(false)}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            style={{
              background: 'var(--tg-subtle)',
              color: 'var(--primary)',
              border: '1px solid var(--tg-border-primary)',
              opacity: loading ? 0.65 : 1,
            }}
          >
            Refresh
          </button>
        </div>

        {queueInfo ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              className="p-3 rounded-xl"
              style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
            >
              <p className="text-xs text-muted-theme uppercase mb-1">Route</p>
              <p className="text-sm font-semibold text-theme">{queueInfo.route || '-'}</p>
            </div>
            <div
              className="p-3 rounded-xl"
              style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
            >
              <p className="text-xs text-muted-theme uppercase mb-1">Plate</p>
              <p className="text-sm font-semibold text-theme">{queueInfo.plate_number || '-'}</p>
            </div>
            <div
              className="p-3 rounded-xl"
              style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
            >
              <p className="text-xs text-muted-theme uppercase mb-1">Departure</p>
              <p className="text-sm font-semibold text-theme">
                {queueInfo.departure_time
                  ? new Date(queueInfo.departure_time).toLocaleString('en-PH')
                  : 'TBD'}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="mt-4 p-4 rounded-xl text-sm"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)' }}
          >
            You are not in queue yet. Set your queue status to Queued or Boarding in My Vehicle tab.
          </div>
        )}
      </div>

      <div className="card-glow rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--tg-border)' }}>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Passenger
                </th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Pickup Location
                </th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Seats / Amount
                </th>
                <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Time
                </th>
                <th className="text-right p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-6 text-muted-theme" colSpan={5}>
                    Loading passengers...
                  </td>
                </tr>
              ) : !queueInfo ? (
                <tr>
                  <td className="p-6 text-muted-theme" colSpan={5}>
                    No active queued/boarding van.
                  </td>
                </tr>
              ) : passengers.length === 0 ? (
                <tr>
                  <td className="p-6 text-muted-theme" colSpan={5}>
                    No passengers yet for this queued/boarding trip.
                  </td>
                </tr>
              ) : (
                passengers.map((row) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: '1px solid var(--tg-border)' }}
                    className="hover:bg-[var(--tg-subtle)] transition-colors"
                  >
                    <td className="p-4">
                      <p className="text-theme font-semibold">{row.full_name || 'Passenger'}</p>
                      <p className="text-muted-theme text-xs flex items-center gap-1">
                        <Phone size={11} /> {row.contact_number || '-'}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="text-theme">{row.pickup_location || 'Not provided'}</p>
                      <p className="text-muted-theme text-xs">{row.route || queueInfo.route || '-'}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-theme font-semibold">{Number(row.seat_count || 0)} seat(s)</p>
                      <p className="text-muted-theme text-xs">{formatPeso(Number(row.amount_due || 0))}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-muted-theme text-xs">
                        {new Date(row.paid_at || row.created_at).toLocaleString('en-PH')}
                      </p>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleOpenPickupMap(row)}
                          disabled={!String(row.pickup_location || '').trim()}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition disabled:opacity-50"
                          style={{
                            background: 'var(--tg-subtle)',
                            color: 'var(--primary)',
                            border: '1px solid var(--tg-border-primary)',
                          }}
                        >
                          View Map
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePickedUp(row)}
                          disabled={rowActionLoadingId === row.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition disabled:opacity-50"
                          style={{
                            background: 'rgba(34,197,94,0.14)',
                            color: '#22c55e',
                            border: '1px solid rgba(34,197,94,0.35)',
                          }}
                        >
                          {rowActionLoadingId === row.id ? 'Saving...' : 'Picked Up'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {mapModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[250] flex items-center justify-center px-4">
            <button
              type="button"
              aria-label="Close pickup map"
              className="absolute inset-0"
              style={{ background: 'rgba(2, 8, 23, 0.55)' }}
              onClick={closeMapModal}
            />
            <div
              className="relative w-full max-w-3xl rounded-2xl overflow-hidden"
              style={{
                background: 'var(--tg-card)',
                border: '1px solid var(--tg-border)',
                boxShadow: 'var(--tg-shadow)',
              }}
            >
              <div
                className="px-5 py-4 flex items-start justify-between gap-3"
                style={{ borderBottom: '1px solid var(--tg-border)' }}
              >
                <div>
                  <h4 className="text-theme font-bold text-base">Passenger Pickup Map</h4>
                  <p className="text-muted-theme text-xs mt-1">
                    {mapReservation?.full_name || 'Passenger'} -{' '}
                    {mapReservation?.pickup_location || 'No location'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeMapModal}
                  className="p-2 rounded-lg transition hover:bg-[var(--tg-subtle)] cursor-pointer"
                  style={{ color: 'var(--tg-muted)' }}
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              <div className="h-[380px]" style={{ background: 'var(--tg-bg-alt)' }}>
                {mapLoading ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-theme">
                    Loading map...
                  </div>
                ) : mapMarker ? (
                  <LeafletMapContainer
                    center={mapCenter}
                    zoom={16}
                    scrollWheelZoom
                    style={{ height: '100%', width: '100%' }}
                  >
                    <LeafletTileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LeafletMarker position={mapMarker}>
                      <LeafletPopup>
                        <div style={{ minWidth: 200 }}>
                          <p style={{ margin: 0, fontWeight: 700 }}>
                            {mapReservation?.full_name || 'Passenger'}
                          </p>
                          <p style={{ margin: 0, fontSize: 12 }}>
                            {mapReservation?.pickup_location || 'Pickup location'}
                          </p>
                        </div>
                      </LeafletPopup>
                    </LeafletMarker>
                  </LeafletMapContainer>
                ) : (
                  <div className="h-full flex items-center justify-center px-6 text-center">
                    <p className="text-sm text-muted-theme">
                      {mapError || 'No map coordinates found for this pickup location.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MY VEHICLE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function MyVehicleContent({
  accessToken,
  operatorUserId,
  operatorName,
  operatorEmail,
}: {
  accessToken: string;
  operatorUserId: string;
  operatorName: string;
  operatorEmail: string;
}) {
  const [queueLoading, setQueueLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [queueRows, setQueueRows] = useState<QueueEntry[]>([]);
  const [route, setRoute] = useState('');
  const [driverName, setDriverName] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [seatMapLoading, setSeatMapLoading] = useState(false);
  const [seatMapRefreshing, setSeatMapRefreshing] = useState(false);
  const [seatActionLoading, setSeatActionLoading] = useState(false);
  const [seatMap, setSeatMap] = useState<OperatorSeatMapItem[]>([]);
  const [selectedSeatLabel, setSelectedSeatLabel] = useState('');
  const [walkInName, setWalkInName] = useState('');

  const loadQueue = async (isManual = false) => {
    try {
      if (isManual) {
        setRefreshing(true);
      } else {
        setQueueLoading(true);
      }
      const rows = await fetchActiveQueue();
      setQueueRows(rows || []);
      const mine = (rows || []).find(
        (r) =>
          (operatorUserId && r.operatorUserId === operatorUserId) ||
          (!!operatorEmail &&
            r.operatorEmail?.toLowerCase() === operatorEmail.toLowerCase())
      );
      if (mine) {
        setRoute(mine.route || '');
        setDriverName(mine.driver || '');
        setPlateNumber(mine.plate || '');
      }
    } catch (err: any) {
      sileoToast.error({
        title: 'Queue load failed',
        description: err?.message || 'Unable to fetch queue.',
      });
    } finally {
      if (isManual) {
        setRefreshing(false);
      } else {
        setQueueLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!operatorEmail && !operatorUserId) return;
    setDriverName(operatorName || '');
    void loadQueue();
    const timer = window.setInterval(() => {
      void loadQueue();
    }, 300000);
    return () => window.clearInterval(timer);
  }, [operatorEmail, operatorName, operatorUserId]);

  const myQueue = queueRows.find(
    (r) =>
      (operatorUserId && r.operatorUserId === operatorUserId) ||
      (!!operatorEmail &&
        r.operatorEmail?.toLowerCase() === operatorEmail.toLowerCase())
  );
  const inQueue = !!myQueue;
  const tripDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tripKey =
    myQueue?.route && myQueue?.departure
      ? `${myQueue.route}|${myQueue.departure}|${tripDate}`
      : '';

  const selectedSeat = seatMap.find((seat) => seat.seatLabel === selectedSeatLabel) || null;

  const loadSeatMap = async (isManual = false, silent = false) => {
    if (!accessToken || !tripKey || !inQueue) {
      setSeatMap([]);
      setSelectedSeatLabel('');
      return;
    }

    try {
      if (isManual) {
        setSeatMapRefreshing(true);
      } else {
        setSeatMapLoading(true);
      }

      const params = new URLSearchParams({ tripKey });
      const response = await fetch(`/api/operator/seats?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to load seat map.');
      }

      const rows = (result?.seats || []) as OperatorSeatMapItem[];
      setSeatMap(rows);
      setSelectedSeatLabel((prev) => {
        if (!prev) return prev;
        const stillSelectable = rows.find(
          (seat) => seat.seatLabel === prev && seat.status === 'available'
        );
        return stillSelectable ? prev : '';
      });
    } catch (err: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Seat map load failed',
          description: err?.message || 'Unable to fetch seats.',
        });
      }
    } finally {
      if (isManual) {
        setSeatMapRefreshing(false);
      } else {
        setSeatMapLoading(false);
      }
    }
  };

  const markSeatAsWalkIn = async () => {
    if (!accessToken || !tripKey || !inQueue || !myQueue) return;
    if (!selectedSeatLabel) {
      sileoToast.warning({
        title: 'Seat required',
        description: 'Please select an available seat.',
      });
      return;
    }
    if (!walkInName.trim()) {
      sileoToast.warning({
        title: 'Passenger name required',
        description: 'Please input walk-in commuter name.',
      });
      return;
    }

    try {
      setSeatActionLoading(true);
      const response = await fetch('/api/operator/seats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          route: myQueue.route,
          tripKey,
          seatLabel: selectedSeatLabel,
          passengerName: walkInName.trim(),
          queueId: myQueue.id,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to assign walk-in seat.');
      }

      setSeatMap((result?.seats || []) as OperatorSeatMapItem[]);
      setSelectedSeatLabel('');
      setWalkInName('');
      sileoToast.success({ title: 'Seat marked occupied' });
    } catch (err: any) {
      sileoToast.error({
        title: 'Seat action failed',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setSeatActionLoading(false);
    }
  };

  const releaseWalkIn = async (seatLabel: string) => {
    if (!accessToken || !tripKey || !inQueue) return;
    try {
      setSeatActionLoading(true);
      const response = await fetch('/api/operator/seats', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ tripKey, seatLabel }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to release seat.');
      }

      setSeatMap((result?.seats || []) as OperatorSeatMapItem[]);
      if (selectedSeatLabel === seatLabel) setSelectedSeatLabel('');
      sileoToast.success({ title: `Seat ${seatLabel} released` });
    } catch (err: any) {
      sileoToast.error({
        title: 'Seat action failed',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setSeatActionLoading(false);
    }
  };

  useEffect(() => {
    if (!inQueue || !tripKey || !accessToken) {
      setSeatMap([]);
      setSelectedSeatLabel('');
      return;
    }

    void loadSeatMap(false);
    const timer = window.setInterval(() => {
      void loadSeatMap(false, true);
    }, 15000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inQueue, tripKey, accessToken]);

  const runQueueAction = async (
    action: 'join' | 'leave' | 'boarding',
    successTitle: string
  ) => {
    if (!accessToken) {
      sileoToast.error({
        title: 'Session expired',
        description: 'Please login again.',
      });
      return;
    }

    if (action === 'join') {
      if (!route.trim()) {
        sileoToast.warning({
          title: 'Route required',
          description: 'Please input your route first.',
        });
        return;
      }
      if (!driverName.trim()) {
        sileoToast.warning({
          title: 'Driver required',
          description: 'Please input the driver name.',
        });
        return;
      }
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/queue/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action,
          route: route.trim(),
          driverName: driverName.trim(),
          departureTime: departureTime.trim(),
          plateNumber: plateNumber.trim(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        sileoToast.error({
          title: 'Queue action failed',
          description: result?.error || 'Please try again.',
        });
        setActionLoading(false);
        return;
      }

      sileoToast.success({ title: successTitle });
      await loadQueue();
    } catch (err: any) {
      sileoToast.error({
        title: 'Queue action failed',
        description: err?.message || 'Please try again later.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="admin-tab space-y-6">
      <div
        className="rounded-2xl p-6 md:p-8 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))',
        }}
      >
        <div className="absolute right-[-20px] top-[-20px] opacity-10">
          <Bus size={180} color="#fff" />
        </div>
        <p
          className="text-sm font-medium mb-2"
          style={{ color: 'rgba(255,255,255,0.75)' }}
        >
          Current Queue Status
        </p>
        {queueLoading ? (
          <p className="text-white text-sm opacity-80">Loading queue...</p>
        ) : inQueue ? (
          <>
            <div className="flex items-end gap-2 mb-6">
              <h1 className="text-5xl md:text-6xl font-extrabold text-white">
                #{myQueue?.position || 0}
              </h1>
              <span className="text-lg mb-2 font-medium text-white opacity-80">
                in line
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
              <div>
                <p
                  className="text-xs uppercase tracking-wider"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  Route
                </p>
                <p className="font-bold text-lg text-white">
                  {myQueue?.route || 'N/A'}
                </p>
              </div>
              <div>
                <p
                  className="text-xs uppercase tracking-wider"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  Plate Number
                </p>
                <p className="font-bold text-lg text-white">
                  {myQueue?.plate || 'N/A'}
                </p>
              </div>
              <div>
                <p
                  className="text-xs uppercase tracking-wider"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  Status
                </p>
                <p className="font-bold text-lg text-white uppercase">
                  {myQueue?.status || 'queued'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
              Not in queue yet
            </h1>
            <p className="text-sm text-white opacity-85">
              Fill in your trip details below and join the queue for your turn.
            </p>
          </>
        )}
      </div>

      <div className="card-glow p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-theme font-bold">Queue Controls</h3>
          <button
            onClick={() => void loadQueue(true)}
            disabled={queueLoading || actionLoading || refreshing}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={{
              background: 'var(--tg-subtle)',
              color: 'var(--primary)',
              border: '1px solid var(--tg-border-primary)',
              opacity: queueLoading || actionLoading || refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
              Route
            </label>
            <input
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="e.g. Isabel -> Ormoc"
              className="input-dark w-full"
              disabled={actionLoading || inQueue}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
              Driver Name
            </label>
            <input
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="Driver full name"
              className="input-dark w-full"
              disabled={actionLoading || inQueue}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
              Departure Time
            </label>
            <input
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="input-dark w-full"
              disabled={actionLoading || inQueue}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-1.5">
              Plate Number
            </label>
            <input
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              placeholder="Optional (auto from application if empty)"
              className="input-dark w-full"
              disabled={actionLoading || inQueue}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!inQueue ? (
            <button
              onClick={() => runQueueAction('join', 'Joined queue successfully')}
              disabled={actionLoading || queueLoading}
              className="btn-primary text-sm px-4 py-2"
            >
              Join Queue
            </button>
          ) : (
            <>
              {myQueue?.status !== 'boarding' && (
                <button
                  onClick={() =>
                    runQueueAction('boarding', 'Status updated to boarding')
                  }
                  disabled={
                    actionLoading || queueLoading || (myQueue?.position || 0) !== 1
                  }
                  className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
                  style={{
                    background: 'rgba(245,158,11,0.12)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.35)',
                    opacity: (myQueue?.position || 0) === 1 ? 1 : 0.55,
                  }}
                >
                  Set Boarding
                </button>
              )}
              <button
                onClick={() =>
                  runQueueAction(
                    'leave',
                    myQueue?.status === 'boarding'
                      ? 'Trip marked as departed'
                      : 'Removed from queue'
                  )
                }
                disabled={actionLoading || queueLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
                style={{
                  background: 'rgba(239,68,68,0.12)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.35)',
                }}
              >
                {myQueue?.status === 'boarding' ? 'Mark Departed' : 'Leave Queue'}
              </button>
            </>
          )}
        </div>
        {inQueue && myQueue?.status !== 'boarding' && (myQueue?.position || 0) !== 1 && (
          <p className="text-xs mt-3" style={{ color: 'var(--tg-muted)' }}>
            Waiting turn: only queue position #1 can set boarding.
          </p>
        )}
      </div>

      <div className="card-glow p-5 rounded-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-theme font-bold">Walk-in Seat Manager</h3>
          <button
            onClick={() => void loadSeatMap(true)}
            disabled={!inQueue || seatMapLoading || seatActionLoading || seatMapRefreshing}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            style={{
              background: 'var(--tg-subtle)',
              color: 'var(--primary)',
              border: '1px solid var(--tg-border-primary)',
              opacity:
                !inQueue || seatMapLoading || seatActionLoading || seatMapRefreshing
                  ? 0.6
                  : 1,
            }}
          >
            Refresh Seats
          </button>
        </div>

        {!inQueue ? (
          <p className="text-sm text-muted-theme">
            Join queue first to manage walk-in seat occupancy.
          </p>
        ) : (
          <>
            <div
              className="grid grid-cols-7 gap-2 mb-4 transition-opacity"
              style={{ opacity: seatMapLoading ? 0.65 : 1 }}
            >
              {Array.from({ length: 14 }, (_, index) => {
                const label = String(index + 1);
                const seat =
                  seatMap.find((item) => item.seatLabel === label) || null;
                const isAvailable = seat?.status === 'available';
                const isLocked = seat?.status === 'locked';
                const isReserved = seat?.status === 'reserved';
                const isSelected = selectedSeatLabel === label;

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (seatMapLoading) return;
                      if (!isAvailable) return;
                      setSelectedSeatLabel((prev) => (prev === label ? '' : label));
                    }}
                    className="h-11 rounded-lg text-sm font-bold transition cursor-pointer"
                    style={
                      isSelected
                        ? {
                            background: 'var(--primary)',
                            color: '#fff',
                            border: '1px solid var(--primary)',
                          }
                        : isReserved
                          ? {
                              background: 'rgba(34,197,94,0.14)',
                              color: '#22c55e',
                              border: '1px solid rgba(34,197,94,0.35)',
                            }
                          : isLocked
                            ? {
                                background: 'rgba(245,158,11,0.14)',
                                color: '#f59e0b',
                                border: '1px solid rgba(245,158,11,0.35)',
                              }
                            : {
                                background: 'var(--tg-bg-alt)',
                                color: 'var(--tg-text)',
                                border: '1px solid var(--tg-border)',
                              }
                    }
                    title={
                      seat?.passengerName
                        ? `${seat.passengerName} (${seat.source === 'walk_in' ? 'walk-in' : 'reservation'})`
                        : `Seat ${label}`
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-3">
              <input
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder="Walk-in commuter name"
                className="input-dark w-full"
                disabled={seatActionLoading || seatMapLoading}
              />
              <button
                onClick={() => void markSeatAsWalkIn()}
                disabled={!selectedSeatLabel || !walkInName.trim() || seatActionLoading || seatMapLoading}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
              >
                {seatActionLoading ? 'Saving...' : `Occupy Seat ${selectedSeatLabel || ''}`.trim()}
              </button>
            </div>

            <div className="text-xs text-muted-theme mb-2">
              Selected seat: <span className="font-semibold text-theme">{selectedSeatLabel || 'None'}</span>
              {selectedSeat?.status === 'available' ? ' (available)' : ''}
            </div>

            <div className="space-y-2">
              {seatMap.filter((seat) => seat.status !== 'available').length === 0 ? (
                <p className="text-sm text-muted-theme">No occupied/reserved seats yet.</p>
              ) : (
                seatMap
                  .filter((seat) => seat.status !== 'available')
                  .map((seat) => (
                    <div
                      key={`occ-${seat.seatLabel}`}
                      className="flex items-center justify-between p-2.5 rounded-xl"
                      style={{
                        background: 'var(--tg-bg-alt)',
                        border: '1px solid var(--tg-border)',
                      }}
                    >
                      <div className="text-sm">
                        <p className="text-theme font-semibold">
                          Seat {seat.seatLabel} - {seat.passengerName || 'Passenger'}
                        </p>
                        <p className="text-muted-theme text-xs uppercase">
                          {seat.source === 'walk_in' ? 'walk-in' : 'online reservation'} | {seat.status}
                        </p>
                      </div>
                      {seat.source === 'walk_in' && (
                        <button
                          type="button"
                          onClick={() => void releaseWalkIn(seat.seatLabel)}
                          disabled={seatActionLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                          style={{
                            background: 'rgba(239,68,68,0.12)',
                            color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.35)',
                            opacity: seatActionLoading ? 0.6 : 1,
                          }}
                        >
                          Release
                        </button>
                      )}
                    </div>
                  ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="card-glow p-5 rounded-2xl">
        <h3 className="text-theme font-bold mb-4">Route Queue Snapshot</h3>
        {queueLoading ? (
          <p className="text-sm text-muted-theme">Loading...</p>
        ) : queueRows.length === 0 ? (
          <p className="text-sm text-muted-theme">No active vans in queue.</p>
        ) : (
          <div className="space-y-2">
            {queueRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
              >
                <div>
                  <p className="text-theme text-sm font-semibold">
                    #{row.position} {row.operatorName}
                  </p>
                  <p className="text-muted-theme text-xs">
                    {row.route} | {row.plate} | Departs: {row.departure || 'TBD'}
                  </p>
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold uppercase"
                  style={
                    row.status === 'boarding'
                      ? { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
                      : { background: 'rgba(37,151,233,0.12)', color: 'var(--primary)' }
                  }
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function IncomeHistoryContent({ accessToken }: { accessToken: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({ today: 0, week: 0, month: 0 });
  const [payments, setPayments] = useState<OperatorPaymentRecord[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchOperatorPaymentHistory(accessToken);
        if (cancelled) return;
        setSummary(data.summary);
        setPayments(data.payments || []);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load payment history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const formatPeso = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="admin-tab space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Today', value: formatPeso(summary.today), color: 'var(--primary)' },
          { label: 'This Week', value: formatPeso(summary.week), color: '#22c55e' },
          { label: 'This Month', value: formatPeso(summary.month), color: '#a855f7' },
        ].map((stat, i) => (
          <div key={i} className="card-glow p-5 rounded-2xl">
            <p className="text-xs text-muted-theme font-semibold uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-2xl font-extrabold text-theme">{stat.value}</p>
            <div className="w-full h-1 rounded-full mt-3" style={{ background: 'var(--tg-bg-alt)' }}>
              <div className="h-full rounded-full" style={{ background: stat.color, width: `${30 + i * 30}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card-glow p-6 rounded-2xl">
        <h3 className="text-theme font-bold text-lg mb-4">My Payment History</h3>
        {loading ? (
          <div className="flex justify-center py-10">
            <svg className="animate-spin h-8 w-8" style={{ color: 'var(--primary)' }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        ) : error ? (
          <p className="text-sm font-medium" style={{ color: '#ef4444' }}>{error}</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-theme">No paid reservations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--tg-border)' }}>
                  <th className="text-left p-3 text-muted-theme font-semibold text-xs uppercase tracking-wider">Passenger</th>
                  <th className="text-left p-3 text-muted-theme font-semibold text-xs uppercase tracking-wider">Route</th>
                  <th className="text-center p-3 text-muted-theme font-semibold text-xs uppercase tracking-wider">Seats</th>
                  <th className="text-right p-3 text-muted-theme font-semibold text-xs uppercase tracking-wider">Amount</th>
                  <th className="text-right p-3 text-muted-theme font-semibold text-xs uppercase tracking-wider">Paid Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    style={{ borderBottom: '1px solid var(--tg-border)' }}
                    className="hover:bg-[var(--tg-subtle)] transition-colors"
                  >
                    <td className="p-3 text-theme font-medium">{payment.passenger}</td>
                    <td className="p-3 text-theme">{payment.route}</td>
                    <td className="p-3 text-center">
                      <span className="step-badge text-xs">{payment.seats}</span>
                    </td>
                    <td className="p-3 text-right font-bold" style={{ color: '#22c55e' }}>
                      {formatPeso(payment.amount)}
                    </td>
                    <td className="p-3 text-right text-muted-theme">
                      {new Date(payment.paidAt || payment.createdAt).toLocaleString('en-PH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

