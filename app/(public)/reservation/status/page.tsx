'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase/client';
import { MessageCircle, Smile, X } from 'lucide-react';
import {
  fetchReservationStatus,
  sendReservationMessage,
  type ReservationMessage,
  type ReservationStatusResult,
  type ReservationStatusPayload,
} from '@/lib/services/payment.services';
import sileoToast from '@/lib/utils/sileo-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FaCheckCircle, FaClock, FaComments, FaPaperPlane } from 'react-icons/fa';

const statusLabel = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'paid':
    case 'pending_operator_approval':
      return 'Paid - Waiting for operator confirmation';
    case 'confirmed':
      return 'Confirmed';
    case 'departed':
      return 'Van Departed';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'picked_up':
      return 'Picked Up - Trip completed';
    case 'pending_payment':
      return 'Pending Payment';
    default:
      return status || 'Unknown';
  }
};

const STATUS_POLL_INTERVAL_MS = 12000;

export default function ReservationStatusPage() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get('reservation_id') || '';
  const reservationToken = searchParams.get('reservation_token') || '';
  const paymentFlag = searchParams.get('payment') || '';
  const paymentReference =
    searchParams.get('payment_reference') ||
    searchParams.get('payment_id') ||
    searchParams.get('reference') ||
    searchParams.get('checkout_session_id') ||
    '';

  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<ReservationStatusPayload | null>(
    null
  );
  const [operator, setOperator] = useState<{ name: string; email: string } | null>(
    null
  );
  const [messages, setMessages] = useState<ReservationMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatBodyRef = React.useRef<HTMLDivElement | null>(null);
  const hasConfirmedPaymentRef = React.useRef(false);
  const chatRealtimeRef = React.useRef<RealtimeChannel | null>(null);
  const chatOpenRef = React.useRef(false);
  const seenMessagesInitializedRef = React.useRef(false);
  const seenMessageIdsRef = React.useRef<Set<string>>(new Set());
  const quickEmojis = ['😀', '😁', '😂', '😊', '😍', '👍', '🙏', '❤️'];

  const mergeMessages = (
    current: ReservationMessage[],
    incoming: ReservationMessage[]
  ) => {
    const byId = new Map<string, ReservationMessage>();
    [...current, ...incoming].forEach((msg) => {
      byId.set(msg.id, msg);
    });
    return [...byId.values()].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  };

  const scrollChatToLatest = React.useCallback(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  const loadStatus = async (
    options?: { silent?: boolean }
  ): Promise<ReservationStatusResult | null> => {
    const silent = !!options?.silent;
    if (!reservationId) return null;
    try {
      const data = await fetchReservationStatus(reservationId, reservationToken);
      setReservation(data.reservation);
      setOperator(data.operator);
      setMessages(data.messages);
      return data;
    } catch (error: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Failed to load reservation',
          description: error?.message || 'Please try again later.',
        });
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reservationId || !reservationToken) {
      setLoading(false);
      return;
    }
    if (paymentFlag === 'cancelled') {
      sileoToast.warning({
        title: 'Payment cancelled',
        description: 'You can retry payment anytime.',
      });
    }

    const bootstrap = async () => {
      const statusSnapshot = await loadStatus({ silent: true });
      const normalizedStatus = String(
        statusSnapshot?.reservation?.status || ''
      ).toLowerCase();
      const alreadyProcessed =
        normalizedStatus === 'pending_operator_approval' ||
        normalizedStatus === 'paid' ||
        normalizedStatus === 'confirmed' ||
        normalizedStatus === 'departed' ||
        normalizedStatus === 'picked_up';

      if (
        paymentFlag === 'success' &&
        !hasConfirmedPaymentRef.current &&
        !alreadyProcessed
      ) {
        hasConfirmedPaymentRef.current = true;
        try {
          const res = await fetch('/api/reservations/mark-paid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reservationId,
              reservationToken,
              paymentReference,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || 'Failed to finalize payment.');
          }
          sileoToast.success({
            title: 'Payment received',
            description: 'Your reservation is now under operator review.',
          });
        } catch (error: any) {
          sileoToast.error({
            title: 'Payment sync failed',
            description: error?.message || 'Please refresh after a few seconds.',
          });
        }
      }
      await loadStatus({ silent: false });
    };

    void bootstrap();
    const timer = window.setInterval(() => {
      void loadStatus({ silent: true });
    }, STATUS_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId, reservationToken, paymentFlag, paymentReference]);

  useEffect(() => {
    if (!reservationId || !reservationToken) return;

    const channel = supabase
      .channel(`reservation-chat-${reservationId}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        'broadcast',
        { event: 'new-message' },
        (payload: {
          payload?: { reservationId?: string; message?: ReservationMessage };
        }) => {
          const incomingReservationId = (
            payload?.payload?.reservationId || ''
          ).trim();
          if (incomingReservationId !== reservationId) return;
          const row = payload?.payload?.message;
          if (!row?.id) return;
          setMessages((prev) => mergeMessages(prev, [row]));
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
  }, [reservationId, reservationToken]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [messages]
  );
  const isChatClosed = ['picked_up', 'cancelled', 'departed'].includes(
    String(reservation?.status || '').toLowerCase()
  );

  useEffect(() => {
    if (!chatOpen) return;
    scrollChatToLatest();
  }, [chatOpen, sortedMessages, scrollChatToLatest]);

  useEffect(() => {
    if (!chatOpen) setShowEmojiPicker(false);
  }, [chatOpen]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) {
      setChatUnreadCount(0);
      const seen = seenMessageIdsRef.current;
      sortedMessages.forEach((msg) => {
        if (msg?.id) seen.add(msg.id);
      });
    }
  }, [chatOpen, sortedMessages]);

  useEffect(() => {
    if (!seenMessagesInitializedRef.current) {
      const seen = new Set<string>();
      sortedMessages.forEach((msg) => {
        if (msg?.id) seen.add(msg.id);
      });
      seenMessageIdsRef.current = seen;
      seenMessagesInitializedRef.current = true;
      return;
    }

    let unreadIncrement = 0;
    const seen = seenMessageIdsRef.current;

    for (const msg of sortedMessages) {
      if (!msg?.id || seen.has(msg.id)) continue;
      seen.add(msg.id);
      if (
        !chatOpenRef.current &&
        String(msg.sender_type || '').toLowerCase() === 'operator'
      ) {
        unreadIncrement += 1;
      }
    }

    if (unreadIncrement > 0) {
      setChatUnreadCount((prev) => prev + unreadIncrement);
    }
  }, [sortedMessages]);

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || !reservationId || sending || isChatClosed) return;

    const tempId = `tmp-pass-${Date.now()}`;
    const tempMessage: ReservationMessage = {
      id: tempId,
      sender_type: 'passenger',
      sender_name: reservation?.full_name || 'Passenger',
      message: text,
      created_at: new Date().toISOString(),
    };

    setSending(true);
    try {
      setMessages((prev) => mergeMessages(prev, [tempMessage]));
      setChatInput('');

      const savedMessage = await sendReservationMessage({
        reservationId,
        reservationToken,
        message: text,
        senderType: 'passenger',
        senderName: reservation?.full_name || 'Passenger',
      });
      setMessages((prev) =>
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
            reservationId,
            message: savedMessage,
          },
        });
      }
      setShowEmojiPicker(false);
    } catch (error: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setChatInput(text);
      if ((error?.message || '').toLowerCase() === 'chat_closed') {
        sileoToast.info({
          title: 'Chat is closed',
          description: 'This reservation is already completed.',
        });
        return;
      }
      sileoToast.error({
        title: 'Message failed',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
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
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card-glow rounded-2xl p-8 text-center max-w-lg w-full">
          <h1 className="text-2xl font-bold text-theme mb-2">
            {!reservationToken ? 'Invalid Access Link' : 'Reservation Not Found'}
          </h1>
          <p className="text-muted-theme text-sm">
            {!reservationToken
              ? 'This reservation link is missing an access token. Please use the latest payment receipt link.'
              : 'Please check your reservation link and try again.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="px-6 py-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="card-glow rounded-2xl p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h1 className="text-2xl font-bold text-theme">Reservation Summary</h1>
            <span className="step-badge flex items-center gap-1.5">
              <FaClock size={11} /> {statusLabel(reservation.status)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-theme">Reservation ID</p>
              <p className="text-theme font-semibold break-all">{reservation.id}</p>
            </div>
            <div>
              <p className="text-muted-theme">Route</p>
              <p className="text-theme font-semibold">{reservation.route}</p>
            </div>
            <div>
              <p className="text-muted-theme">Passenger</p>
              <p className="text-theme font-semibold">{reservation.full_name}</p>
            </div>
            <div>
              <p className="text-muted-theme">Contact</p>
              <p className="text-theme font-semibold">{reservation.contact_number}</p>
            </div>
            <div>
              <p className="text-muted-theme">Seats</p>
              <p className="text-theme font-semibold">
                {(reservation.seat_labels || []).join(', ') || '-'}
              </p>
            </div>
            <div>
              <p className="text-muted-theme">Amount</p>
              <p className="text-theme font-semibold">
                PHP {Number(reservation.amount_due || 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div
            className="mt-6 pt-5 border-t"
            style={{ borderColor: 'var(--tg-border)' }}
          >
            <h3 className="text-lg font-bold text-theme mb-3">Assigned Operator</h3>
            {operator ? (
              <div className="space-y-2 text-sm">
                <p className="text-theme font-semibold">{operator.name}</p>
                <p className="text-muted-theme">{operator.email || 'No email provided'}</p>
                <p className="text-xs text-muted-theme flex items-center gap-1.5">
                  <FaCheckCircle style={{ color: '#22c55e' }} />
                  Linked to your queued van
                </p>
              </div>
            ) : (
              <p className="text-muted-theme text-sm">
                Operator assignment is not available yet.
              </p>
            )}
          </div>
        </div>
      </div>

      
    </main>

    {mounted &&
      createPortal(
        <>
      {!chatOpen && (
        <button
          onClick={() => {
            setChatUnreadCount(0);
            setChatOpen(true);
          }}
          className="z-[120] w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition hover:scale-105 cursor-pointer relative"
          style={{
            position: 'fixed',
            right: 'max(16px, env(safe-area-inset-right))',
            bottom: 'max(16px, env(safe-area-inset-bottom))',
            left: 'unset',
            top: 'unset',
            background: 'var(--primary)',
            color: '#fff',
          }}
          title="Open chat"
        >
          <MessageCircle size={22} />
          {chatUnreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center"
              style={{ background: '#ef4444', border: '2px solid var(--tg-bg)' }}
            >
              {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
            </span>
          )}
        </button>
      )}

      {chatOpen && (
        <div
          className="z-[130] w-[calc(100vw-1rem)] sm:w-[390px] max-w-[390px] flex flex-col overflow-hidden rounded-[18px]"
          style={{
            position: 'fixed',
            right: 'max(12px, env(safe-area-inset-right))',
            bottom: 'max(10px, env(safe-area-inset-bottom))',
            left: 'unset',
            top: 'unset',
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
              <div
                className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                style={{
                  background: 'rgba(59,130,246,0.12)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(59,130,246,0.3)',
                }}
              >
                <FaComments size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-theme font-semibold truncate">
                  Chat with Van Operator
                </p>
                <span className="text-[11px] text-muted-theme">Realtime</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-8"
                onClick={() => {
                  void loadStatus({ silent: false });
                }}
              >
                Refresh
              </Button>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                title="Close chat"
                className="h-8 w-8 rounded-full flex items-center justify-center cursor-pointer transition hover:bg-[var(--tg-subtle)]"
                style={{ color: 'var(--tg-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 px-3 py-3" style={{ background: 'var(--tg-bg)' }}>
            <ScrollArea
              ref={chatBodyRef}
              className="h-full rounded-xl p-2.5"
              style={{
                background: 'color-mix(in srgb, var(--tg-bg-alt) 90%, #f1f5f9 10%)',
                border: '1px solid var(--tg-border)',
              }}
            >
              {sortedMessages.length === 0 ? (
                <div className="h-full min-h-[180px] flex items-center justify-center text-center px-3">
                  <p className="text-muted-theme text-sm">
                    No messages yet. Start chat with your assigned van operator.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sortedMessages.map((msg) => {
                    const isPassenger = msg.sender_type === 'passenger';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isPassenger ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[84%] rounded-2xl px-3 py-2.5 ${
                            isPassenger ? 'rounded-br-md' : 'rounded-bl-md'
                          }`}
                          style={{
                            background: isPassenger ? 'var(--primary)' : 'var(--tg-card)',
                            color: isPassenger ? '#ffffff' : 'var(--tg-text)',
                            border: isPassenger
                              ? '1px solid transparent'
                              : '1px solid var(--tg-border)',
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
                            style={{
                              color: isPassenger
                                ? 'rgba(255,255,255,0.78)'
                                : 'var(--tg-muted)',
                            }}
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
                    className="absolute bottom-11 left-0 w-48 z-[140] p-2 rounded-xl border"
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
                    void handleSend();
                  }
                }}
                placeholder={isChatClosed ? 'Chat closed' : 'Aa'}
                className="flex-1 h-10 rounded-full border text-sm"
                style={{
                  borderColor: 'var(--tg-border)',
                  background: 'var(--tg-bg-alt)',
                }}
                disabled={isChatClosed}
              />
              <button
                onClick={() => void handleSend()}
                disabled={!chatInput.trim() || sending || isChatClosed}
                className="h-9 w-9 rounded-full flex items-center justify-center cursor-pointer transition disabled:opacity-50"
                style={{ background: 'var(--primary)', color: '#fff' }}
                title="Send"
              >
                <FaPaperPlane size={13} />
              </button>
            </div>
            {isChatClosed && (
              <p className="text-xs text-muted-theme mt-2 px-1">
                Chat is closed because this reservation is already completed.
              </p>
            )}
          </div>
        </div>
      )}
        </>,
        document.body
      )}
    </>
  );
}

