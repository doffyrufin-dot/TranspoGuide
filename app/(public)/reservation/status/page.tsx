'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';
import { Smile } from 'lucide-react';
import {
  fetchReservationStatus,
  sendReservationMessage,
  type ReservationMessage,
  type ReservationStatusPayload,
} from '@/lib/services/payment.services';
import sileoToast from '@/lib/utils/sileo-toast';
import { FaCheckCircle, FaClock, FaComments, FaPaperPlane } from 'react-icons/fa';

const statusLabel = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'paid':
    case 'pending_operator_approval':
      return 'Paid - Waiting for operator confirmation';
    case 'confirmed':
      return 'Confirmed';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'pending_payment':
      return 'Pending Payment';
    default:
      return status || 'Unknown';
  }
};

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatBodyRef = React.useRef<HTMLDivElement | null>(null);
  const hasConfirmedPaymentRef = React.useRef(false);
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

  const loadStatus = async () => {
    if (!reservationId) return;
    try {
      const data = await fetchReservationStatus(reservationId, reservationToken);
      setReservation(data.reservation);
      setOperator(data.operator);
      setMessages(data.messages);
    } catch (error: any) {
      sileoToast.error({
        title: 'Failed to load reservation',
        description: error?.message || 'Please try again later.',
      });
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
      if (paymentFlag === 'success' && !hasConfirmedPaymentRef.current) {
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
      await loadStatus();
    };

    void bootstrap();
    const timer = window.setInterval(loadStatus, 2000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId, reservationToken, paymentFlag, paymentReference]);

  useEffect(() => {
    if (!reservationId || !reservationToken) return;

    const channel = supabase
      .channel(`passenger-res-chat-${reservationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tbl_reservation_messages',
          filter: `reservation_id=eq.${reservationId}`,
        },
        (payload: { new: unknown }) => {
          const row = payload.new as ReservationMessage;
          setMessages((prev) => mergeMessages(prev, [row]));
        }
      )
      .subscribe();

    return () => {
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

  useEffect(() => {
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [sortedMessages]);

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || !reservationId || sending) return;

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
      setShowEmojiPicker(false);
    } catch (error: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setChatInput(text);
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
    <main className="px-6 py-20">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
          </div>

          <div className="card-glow rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-theme flex items-center gap-2">
                <FaComments style={{ color: 'var(--primary)' }} /> Chat with Van Operator
              </h2>
              <button
                onClick={loadStatus}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                style={{
                  background: 'var(--tg-subtle)',
                  border: '1px solid var(--tg-border)',
                  color: 'var(--tg-muted)',
                }}
              >
                Refresh
              </button>
            </div>

            <div
              ref={chatBodyRef}
              className="rounded-xl p-4 mb-4 h-80 overflow-y-auto"
              style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
            >
              {sortedMessages.length === 0 ? (
                <p className="text-muted-theme text-sm">
                  No messages yet. Start chat with your assigned van operator.
                </p>
              ) : (
                <div className="space-y-3">
                  {sortedMessages.map((msg) => {
                    const isPassenger = msg.sender_type === 'passenger';
                    return (
                      <div
                        key={msg.id}
                        className={`max-w-[85%] p-3 rounded-xl ${
                          isPassenger ? 'ml-auto' : ''
                        }`}
                        style={{
                          background: isPassenger
                            ? 'rgba(37,151,233,0.15)'
                            : 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--tg-border)',
                        }}
                      >
                        <p className="text-[11px] text-muted-theme font-semibold mb-1">
                          {msg.sender_name || (isPassenger ? 'Passenger' : 'Operator')}
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
                    background: 'var(--tg-bg-alt)',
                  }}
                  title="Add emoji"
                >
                  <Smile size={16} />
                </button>
                {showEmojiPicker && (
                  <div
                    className="absolute bottom-12 left-0 rounded-xl p-2 w-48 z-[90]"
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
                    void handleSend();
                  }
                }}
                placeholder="Type your message..."
                className="input-dark flex-1 h-11"
              />
              <button
                onClick={handleSend}
                disabled={!chatInput.trim() || sending}
                className="btn-primary px-4 h-11"
              >
                <FaPaperPlane />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-glow rounded-2xl p-6">
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
  );
}

