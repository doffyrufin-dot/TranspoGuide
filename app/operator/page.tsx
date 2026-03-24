'use client';

import React, { useState, useEffect, useMemo, ElementType } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/utils/supabase/client';
import { useTheme } from '@/components/ThemeProvider';
import sileoToast from '@/lib/utils/sileo-toast';
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace('/login');
  };

  const handleNavClick = (view: string) => {
    setActiveView(view);
    setIsSidebarOpen(false);
  };

  const loadNotifications = async (silent = false) => {
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
      switch (activeView) {
      case 'Reservations': return <ReservationsContent accessToken={sessionToken} />;
      case 'Passengers': return <PassengersContent accessToken={sessionToken} />;
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
                <div
                  className="absolute right-0 top-11 w-[320px] max-h-[380px] overflow-y-auto rounded-2xl z-[220]"
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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReservationId, setChatReservationId] = useState('');
  const [chatMessages, setChatMessages] = useState<OperatorReservationMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [unreadThreadCount, setUnreadThreadCount] = useState(0);
  const [pendingReservations, setPendingReservations] = useState<OperatorReservationRecord[]>([]);
  const [pastReservations, setPastReservations] = useState<OperatorReservationRecord[]>([]);
  const chatBodyRef = React.useRef<HTMLDivElement | null>(null);
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
    return [...byId.values()].sort(
      (a, b) =>
        new Date(b.paid_at || b.created_at).getTime() -
        new Date(a.paid_at || a.created_at).getTime()
    );
  }, [pendingReservations, pastReservations]);

  const selectedChatReservation = useMemo(
    () => allReservations.find((r) => r.id === chatReservationId) || null,
    [allReservations, chatReservationId]
  );

  const loadReservations = async (silent = false) => {
    if (!accessToken) return;
    try {
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
    }
  };

  const loadUnreadCount = async (silent = true) => {
    if (!accessToken) return;
    try {
      const result = await fetchOperatorUnreadChatCount(accessToken);
      setUnreadThreadCount(Number(result.unreadThreadCount || 0));
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
    const timer = window.setInterval(() => {
      void loadUnreadCount(true);
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (!chatOpen) return;
    void loadReservations(true);
    const timer = window.setInterval(() => {
      void loadReservations(true);
    }, 10000);
    return () => window.clearInterval(timer);
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
      setChatReservationId(allReservations[0].id);
    }
  }, [allReservations, chatReservationId]);

  useEffect(() => {
    if (!chatOpen || !chatReservationId) return;
    void loadChat(chatReservationId, { silent: false });

    const channel = supabase
      .channel(`operator-res-chat-${chatReservationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tbl_reservation_messages',
          filter: `reservation_id=eq.${chatReservationId}`,
        },
        (payload) => {
          const row = payload.new as OperatorReservationMessage;
          setChatMessages((prev) => mergeMessages(prev, [row]));
        }
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void loadChat(chatReservationId, { silent: true });
    }, 2000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatReservationId, accessToken]);

  useEffect(() => {
    if (!chatOpen) setShowEmojiPicker(false);
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatOpen]);

  if (!mounted) return null;

  return createPortal(
    <>
      <button
        onClick={() => setChatOpen((prev) => !prev)}
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

      {chatOpen && (
        <div
          className="fixed z-[190] w-[calc(100vw-2.5rem)] sm:w-[390px] card-glow rounded-2xl p-4 space-y-3"
          style={{
            position: 'fixed',
            right: '16px',
            bottom: '84px',
            maxHeight: '70vh',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-theme font-bold">Passenger Chat</h3>
            <button
              onClick={() => setChatOpen(false)}
              className="p-1 rounded-md text-muted-theme hover:text-theme"
              title="Close chat"
            >
              <CloseIcon size={16} />
            </button>
          </div>

          <select
            value={chatReservationId}
            onChange={(e) => setChatReservationId(e.target.value)}
            className="input-dark w-full text-sm"
          >
            {allReservations.length === 0 ? (
              <option value="">No reservations available</option>
            ) : (
              allReservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name} - {r.route} ({String(r.status || '').toLowerCase()})
                </option>
              ))
            )}
          </select>

          {selectedChatReservation && (
            <p className="text-xs text-muted-theme">
              Chatting with:{' '}
              <span className="text-theme font-semibold">{selectedChatReservation.full_name}</span>
            </p>
          )}

          <div
            ref={chatBodyRef}
            className="rounded-xl p-3 overflow-y-auto"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
              height: '280px',
            }}
          >
            {chatMessages.length === 0 ? (
              <p className="text-sm text-muted-theme">No messages yet.</p>
            ) : (
              <div className="space-y-2">
                {chatMessages.map((msg) => {
                  const isOperator = msg.sender_type === 'operator';
                  return (
                    <div
                      key={msg.id}
                      className={`max-w-[88%] rounded-xl px-3 py-2 ${isOperator ? 'ml-auto' : ''}`}
                      style={{
                        background: isOperator
                          ? 'rgba(37,151,233,0.15)'
                          : 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--tg-border)',
                      }}
                    >
                      <p className="text-[11px] text-muted-theme font-semibold">
                        {msg.sender_name || (isOperator ? 'Operator' : 'Passenger')}
                      </p>
                      <p className="text-sm text-theme whitespace-pre-wrap">{msg.message}</p>
                      <p className="text-[10px] text-muted-theme mt-1">
                        {new Date(msg.created_at).toLocaleString('en-PH')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="p-2 rounded-lg cursor-pointer transition hover:bg-[var(--tg-subtle)]"
                style={{
                  border: '1px solid var(--tg-border)',
                  color: 'var(--tg-muted)',
                }}
                title="Add emoji"
              >
                <Smile size={16} />
              </button>
              {showEmojiPicker && (
                <div
                  className="absolute bottom-12 right-0 rounded-xl p-2 w-48 z-[210]"
                  style={{
                    background: 'var(--tg-card)',
                    border: '1px solid var(--tg-border)',
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
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSendChat();
                }
              }}
              placeholder="Type message..."
              className="input-dark flex-1 text-sm"
              disabled={!chatReservationId}
            />
            <button
              onClick={handleSendChat}
              disabled={!chatReservationId || !chatInput.trim() || chatSending}
              className="btn-primary px-3 disabled:opacity-50"
            >
              <SendHorizontal size={15} />
            </button>
          </div>
        </div>
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

function PassengersContent({ accessToken }: { accessToken: string }) {
  const [loading, setLoading] = useState(true);
  const [queueInfo, setQueueInfo] = useState<OperatorBoardingQueueInfo | null>(null);
  const [passengers, setPassengers] = useState<OperatorBoardingPassenger[]>([]);
  const formatPeso = (value: number) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const loadPassengers = async (silent = false) => {
    if (!accessToken) return;
    try {
      if (!silent) setLoading(true);
      const result = await fetchOperatorBoardingPassengers(accessToken);
      setQueueInfo(result.queue || null);
      setPassengers(result.passengers || []);
    } catch (err: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load passengers',
          description: err?.message || 'Please try again.',
        });
      }
      setQueueInfo(null);
      setPassengers([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadPassengers(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const mapLinkFor = (pickupLocation: string) => {
    const q = encodeURIComponent(pickupLocation || '');
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  };

  return (
    <div className="admin-tab space-y-5">
      <div className="card-glow p-5 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-theme font-bold text-lg">Boarding Passengers</h3>
            <p className="text-muted-theme text-sm">
              Latest reservations for your current boarding van
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
            You are not in boarding status yet. Set your queue status to Boarding in My Vehicle tab.
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
                  Maps
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
                    No active boarding van.
                  </td>
                </tr>
              ) : passengers.length === 0 ? (
                <tr>
                  <td className="p-6 text-muted-theme" colSpan={5}>
                    No passengers yet for this boarding trip.
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
                      <a
                        href={mapLinkFor(row.pickup_location || '')}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold underline"
                        style={{ color: 'var(--primary)' }}
                      >
                        Open Maps
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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
                onClick={() => runQueueAction('leave', 'Removed from queue')}
                disabled={actionLoading || queueLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
                style={{
                  background: 'rgba(239,68,68,0.12)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.35)',
                }}
              >
                Leave Queue
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

