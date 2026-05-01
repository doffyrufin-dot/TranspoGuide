'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase/client';
import { MessageCircle, Smile, X } from 'lucide-react';
import {
  createCheckoutSession,
  fetchReservationStatus,
  sendReservationMessage,
  submitReservationOperatorFeedback,
  type ReservationOperatorFeedback,
  type ReservationMessage,
  type ReservationStatusResult,
  type ReservationStatusPayload,
} from '@/lib/services/payment.services';
import sileoToast from '@/lib/utils/sileo-toast';
import playNotificationSound from '@/lib/utils/notification-sound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FaCheckCircle,
  FaClock,
  FaComments,
  FaPaperPlane,
  FaStar,
} from 'react-icons/fa';

const statusLabel = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'pending_operator_approval':
      return 'Pending Operator Approval';
    case 'pending_payment':
      return 'Operator Approved - Pay Downpayment';
    case 'paid':
      return 'Paid';
    case 'confirmed':
      return 'Confirmed and Paid';
    case 'departed':
      return 'Van Departed';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'picked_up':
      return 'Picked Up - Trip completed';
    default:
      return status || 'Unknown';
  }
};

const STATUS_POLL_INTERVAL_MS = 6000;
const STATUS_REALTIME_DEBOUNCE_MS = 120;
const isDocumentVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible';
const isExpiredByIso = (value?: string | null) => {
  const iso = String(value || '').trim();
  if (!iso) return false;
  const expiresAtMs = new Date(iso).getTime();
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs <= Date.now();
};

export default function ReservationStatusPage() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get('reservation_id') || '';
  const reservationToken = searchParams.get('reservation_token') || '';
  const reservedFlag = searchParams.get('reserved') || '';
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
  const [operatorFeedback, setOperatorFeedback] =
    useState<ReservationOperatorFeedback | null>(null);
  const [messages, setMessages] = useState<ReservationMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState('');
  const [hasAcceptedPaymentTerms, setHasAcceptedPaymentTerms] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatBodyRef = React.useRef<HTMLDivElement | null>(null);
  const hasConfirmedPaymentRef = React.useRef(false);
  const chatRealtimeRef = React.useRef<RealtimeChannel | null>(null);
  const statusRealtimeRef = React.useRef<RealtimeChannel | null>(null);
  const reserveToastShownRef = React.useRef(false);
  const paymentPromptShownRef = React.useRef(false);
  const paymentExpiredToastShownRef = React.useRef(false);
  const previousStatusRef = React.useRef('');
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

  const loadStatus = useCallback(async (
    options?: { silent?: boolean }
  ): Promise<ReservationStatusResult | null> => {
    const silent = !!options?.silent;
    if (!reservationId) return null;
    try {
      const data = await fetchReservationStatus(reservationId, reservationToken);
      setReservation(data.reservation);
      setOperator(data.operator);
      setOperatorFeedback(data.feedback || null);
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
  }, [reservationId, reservationToken]);

  const isPendingPaymentStatus =
    String(reservation?.status || '').toLowerCase() === 'pending_payment';
  const isPaymentWindowExpired =
    isPendingPaymentStatus && isExpiredByIso(reservation?.lock_expires_at);
  const isAwaitingDownpayment =
    isPendingPaymentStatus && !isPaymentWindowExpired;
  const canRateOperator = (() => {
    const status = String(reservation?.status || '').toLowerCase();
    return (
      !!reservationId &&
      !!reservationToken &&
      !!operator &&
      (status === 'confirmed' ||
        status === 'paid' ||
        status === 'departed' ||
        status === 'picked_up')
    );
  })();

  const openRatingModal = () => {
    setRatingScore(5);
    setRatingFeedback('');
    setRatingError('');
    setShowRatingModal(true);
  };

  const handleSubmitOperatorRating = async () => {
    if (!canRateOperator || !reservationId || !reservationToken) return;
    if (operatorFeedback) {
      setShowRatingModal(false);
      return;
    }
    if (ratingScore < 1 || ratingScore > 5) {
      setRatingError('Please select a rating from 1 to 5 stars.');
      return;
    }

    setRatingSubmitting(true);
    setRatingError('');
    try {
      const savedFeedback = await submitReservationOperatorFeedback({
        reservationId,
        reservationToken,
        rating: ratingScore,
        feedback: ratingFeedback,
      });
      setOperatorFeedback(savedFeedback);
      setShowRatingModal(false);
      sileoToast.success({
        title: 'Thank you for your feedback',
        description: 'Your operator rating was submitted successfully.',
      });
    } catch (error: any) {
      const message = error?.message || 'Failed to submit operator rating.';
      setRatingError(message);
      sileoToast.error({
        title: 'Rating failed',
        description: message,
      });
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleStartDownpayment = async () => {
    if (!reservationId || !reservation || isCreatingCheckout) return;
    if (!isAwaitingDownpayment) {
      sileoToast.info({
        title: 'Payment not available yet',
        description: 'Wait for operator approval before paying downpayment.',
      });
      return;
    }

    setIsCreatingCheckout(true);
    setPaymentModalError('');
    try {
      const seatLabels = (reservation.seat_labels || [])
        .map((seat) => String(seat || '').trim())
        .filter(Boolean)
        .join(', ');

      const checkoutUrl = await createCheckoutSession({
        amount: Number(reservation.amount_due || 0),
        seatLabels,
        fullName: reservation.full_name || 'Passenger',
        passengerEmail: String(reservation.passenger_email || '')
          .trim()
          .toLowerCase(),
        contactNumber: reservation.contact_number || '',
        route: reservation.route || '',
        reservationId: reservation.id,
        operatorUserId: reservation.operator_user_id || undefined,
        queueId: reservation.queue_id || undefined,
      });

      window.location.href = checkoutUrl;
    } catch (error: any) {
      const message = error?.message || 'Failed to start payment.';
      setPaymentModalError(message);
      sileoToast.error({
        title: 'Payment failed',
        description: message,
      });
    } finally {
      setIsCreatingCheckout(false);
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
      const snapshotPaymentExpired =
        normalizedStatus === 'pending_payment' &&
        isExpiredByIso(statusSnapshot?.reservation?.lock_expires_at);
      const alreadyProcessed =
        normalizedStatus === 'pending_operator_approval' ||
        normalizedStatus === 'paid' ||
        normalizedStatus === 'confirmed' ||
        normalizedStatus === 'departed' ||
        normalizedStatus === 'picked_up';

      if (
        paymentFlag === 'success' &&
        !hasConfirmedPaymentRef.current &&
        !alreadyProcessed &&
        !snapshotPaymentExpired
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
            description: 'Your downpayment is received. Reservation is now confirmed.',
          });
        } catch (error: any) {
          const message = String(error?.message || '').toLowerCase();
          if (message.includes('payment window expired')) {
            setShowPaymentModal(false);
            setPaymentModalError('');
            await loadStatus({ silent: true });
            sileoToast.warning({
              title: 'Payment window expired',
              description:
                'Your reservation expired before payment confirmation. Please reserve again.',
            });
            return;
          }
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
      if (!isDocumentVisible()) return;
      void loadStatus({ silent: true });
    }, STATUS_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reservationId, reservationToken, paymentFlag, paymentReference, loadStatus]);

  useEffect(() => {
    if (!reservationId || !reservationToken) return;

    let refreshTimeout: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) return;
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        if (!isDocumentVisible()) return;
        void loadStatus({ silent: true });
      }, STATUS_REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`reservation-status-${reservationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tbl_reservations',
          filter: `id=eq.${reservationId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tbl_seat_locks',
          filter: `reservation_id=eq.${reservationId}`,
        },
        scheduleRefresh
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          scheduleRefresh();
        }
      });

    statusRealtimeRef.current = channel;

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }
      if (statusRealtimeRef.current === channel) {
        statusRealtimeRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [reservationId, reservationToken, loadStatus]);

  useEffect(() => {
    if (reservedFlag !== 'success' || reserveToastShownRef.current) return;
    reserveToastShownRef.current = true;
    sileoToast.success({
      title: 'Reservation submitted',
      description: 'Please wait for operator approval before paying downpayment.',
    });
  }, [reservedFlag]);

  useEffect(() => {
    const normalized = String(reservation?.status || '').toLowerCase();
    if (!normalized) return;

    const previous = previousStatusRef.current;
    previousStatusRef.current = normalized;

    if (normalized !== 'pending_payment' || isPaymentWindowExpired) return;

    if (!paymentPromptShownRef.current) {
      paymentPromptShownRef.current = true;
      setHasAcceptedPaymentTerms(false);
      setShowPaymentModal(true);
      return;
    }

    if (previous && previous !== normalized) {
      playNotificationSound();
      setHasAcceptedPaymentTerms(false);
      setShowPaymentModal(true);
      sileoToast.success({
        title: 'Reservation approved',
        description: 'Pay the downpayment now to finalize your seat.',
      });
    }
  }, [reservation?.status, isPaymentWindowExpired]);

  useEffect(() => {
    const normalized = String(reservation?.status || '').toLowerCase();
    if (normalized === 'pending_payment' && !isPaymentWindowExpired) return;
    setShowPaymentModal(false);
    setPaymentModalError('');
    setHasAcceptedPaymentTerms(false);
  }, [reservation?.status, isPaymentWindowExpired]);

  useEffect(() => {
    if (!isPaymentWindowExpired || paymentExpiredToastShownRef.current) return;
    paymentExpiredToastShownRef.current = true;
    sileoToast.warning({
      title: 'Reservation expired',
      description: 'Payment window ended. Please reserve your seat again.',
    });
  }, [isPaymentWindowExpired]);

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
      playNotificationSound();
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
    <main className="px-4 sm:px-6 py-16 sm:py-20 pb-28 sm:pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="card-glow rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h1 className="text-2xl font-bold text-theme leading-tight">
              Reservation Summary
            </h1>
            <span className="step-badge inline-flex w-full sm:w-auto items-start sm:items-center gap-1.5 leading-snug break-words">
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

          {String(reservation.status || '').toLowerCase() ===
            'pending_operator_approval' && (
            <div
              className="mt-5 rounded-xl p-4"
              style={{
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.35)',
                color: '#f59e0b',
              }}
            >
              <p className="text-sm font-semibold">Waiting for operator approval</p>
              <p className="text-xs mt-1">
                Downpayment will open once your reservation is approved.
              </p>
            </div>
          )}

          {isAwaitingDownpayment && (
            <div
              className="mt-5 rounded-xl p-4"
              style={{
                background: 'rgba(37,151,233,0.12)',
                border: '1px solid rgba(37,151,233,0.35)',
              }}
            >
              <p className="text-sm font-semibold text-theme">
                Your reservation is approved
              </p>
              <p className="text-xs text-muted-theme mt-1">
                Please complete your downpayment to finalize your reservation.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setHasAcceptedPaymentTerms(false);
                    setShowPaymentModal(true);
                    setPaymentModalError('');
                  }}
                  className="h-9 w-full sm:w-auto"
                >
                  Pay Downpayment
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 w-full sm:w-auto"
                  onClick={() => {
                    void loadStatus({ silent: false });
                  }}
                >
                  Refresh
                </Button>
              </div>
            </div>
          )}

          {isPaymentWindowExpired && (
            <div
              className="mt-5 rounded-xl p-4"
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)',
              }}
            >
              <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>
                Reservation payment window expired
              </p>
              <p className="text-xs text-muted-theme mt-1">
                This reservation is no longer payable. Please create a new reservation to continue.
              </p>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9"
                  onClick={() => {
                    window.location.href = '/reservation';
                  }}
                >
                  Reserve Again
                </Button>
              </div>
            </div>
          )}

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
                {canRateOperator && !operatorFeedback && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9"
                      onClick={openRatingModal}
                    >
                      <FaStar size={12} className="mr-1.5" />
                      Rate Operator
                    </Button>
                  </div>
                )}
                {operatorFeedback && (
                  <div
                    className="mt-3 rounded-xl p-3"
                    style={{
                      background: 'var(--tg-bg-alt)',
                      border: '1px solid var(--tg-border)',
                    }}
                  >
                    <p className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
                      Your Rating
                    </p>
                    <div className="mt-1.5 flex items-center gap-1">
                      {Array.from({ length: 5 }, (_, idx) => (
                        <FaStar
                          key={`rated-star-${idx + 1}`}
                          size={14}
                          style={{
                            color:
                              idx + 1 <= Number(operatorFeedback.rating || 0)
                                ? '#f59e0b'
                                : '#9ca3af',
                          }}
                        />
                      ))}
                      <span className="ml-1 text-xs text-muted-theme">
                        ({Number(operatorFeedback.rating || 0)}/5)
                      </span>
                    </div>
                    {operatorFeedback.feedback && (
                      <p className="mt-2 text-xs text-theme leading-relaxed">
                        &ldquo;{operatorFeedback.feedback}&rdquo;
                      </p>
                    )}
                  </div>
                )}
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

    {showPaymentModal && (
      <div
        className="fixed inset-0 z-[140] flex items-center justify-center p-4"
        style={{ background: 'rgba(2, 6, 23, 0.65)' }}
        onClick={() => {
          if (isCreatingCheckout) return;
          setShowPaymentModal(false);
        }}
      >
        <div
          className="w-full max-w-lg card-glow rounded-2xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-xl font-bold text-theme mb-2">
            Reservation Confirmed
          </h3>
            <p className="text-sm text-muted-theme leading-relaxed">
              Your reservation is approved by the operator. Please pay the
              downpayment to finalize your seat.
            </p>
          <div
            className="mt-4 p-3 rounded-xl text-sm"
            style={{
              background: 'var(--tg-bg-alt)',
              border: '1px solid var(--tg-border)',
            }}
          >
            <p className="text-muted-theme">Downpayment Amount</p>
              <p className="text-theme font-bold text-lg">
                PHP {Number(reservation.amount_due || 0).toFixed(2)}
              </p>
            </div>
            <div
              className="mt-4 rounded-xl p-3 text-xs leading-relaxed"
              style={{
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.35)',
                color: '#fbbf24',
              }}
            >
              <p className="font-semibold">Payment Terms</p>
              <p className="mt-1">
                Downpayment is <span className="font-semibold">non-refundable</span>{' '}
                once paid. Please review your route, seat, and passenger details
                before proceeding.
              </p>
            </div>
            <label
              className="mt-3 flex items-start gap-2 text-xs cursor-pointer"
              style={{ color: 'var(--tg-text)' }}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer"
                checked={hasAcceptedPaymentTerms}
                onChange={(e) => setHasAcceptedPaymentTerms(e.target.checked)}
                disabled={isCreatingCheckout}
              />
              <span>
                I understand and agree that this downpayment is non-refundable.
              </span>
            </label>
            {paymentModalError && (
              <p className="mt-3 text-xs font-medium" style={{ color: '#ef4444' }}>
                {paymentModalError}
              </p>
            )}
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPaymentModal(false)}
              disabled={isCreatingCheckout}
            >
              Later
            </Button>
            <Button
              type="button"
              onClick={() => void handleStartDownpayment()}
              disabled={isCreatingCheckout || !hasAcceptedPaymentTerms}
            >
              {isCreatingCheckout ? 'Opening checkout...' : 'Pay Now'}
            </Button>
          </div>
        </div>
      </div>
    )}

    {showRatingModal && (
      <div
        className="fixed inset-0 z-[145] flex items-center justify-center p-4"
        style={{ background: 'rgba(2, 6, 23, 0.65)' }}
        onClick={() => {
          if (ratingSubmitting) return;
          setShowRatingModal(false);
        }}
      >
        <div
          className="w-full max-w-lg card-glow rounded-2xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-xl font-bold text-theme mb-1">Rate Your Operator</h3>
          <p className="text-sm text-muted-theme">
            Your feedback helps commuters find trusted operators.
          </p>

          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
              Rating
            </p>
            <div className="flex items-center gap-2">
              {Array.from({ length: 5 }, (_, idx) => {
                const value = idx + 1;
                const active = value <= ratingScore;
                return (
                  <button
                    key={`rating-input-${value}`}
                    type="button"
                    onClick={() => setRatingScore(value)}
                    className="h-10 w-10 rounded-full flex items-center justify-center cursor-pointer transition"
                    style={{
                      background: active
                        ? 'rgba(245,158,11,0.18)'
                        : 'var(--tg-bg-alt)',
                      border: active
                        ? '1px solid rgba(245,158,11,0.55)'
                        : '1px solid var(--tg-border)',
                      color: active ? '#f59e0b' : '#9ca3af',
                    }}
                    title={`${value} star${value > 1 ? 's' : ''}`}
                  >
                    <FaStar size={16} />
                  </button>
                );
              })}
              <span className="text-sm text-muted-theme">{ratingScore}/5</span>
            </div>
          </div>

          <div className="mt-4">
            <label
              htmlFor="rating-feedback-input"
              className="text-xs font-semibold text-muted-theme uppercase tracking-wider"
            >
              Feedback (Optional)
            </label>
            <textarea
              id="rating-feedback-input"
              value={ratingFeedback}
              onChange={(e) => setRatingFeedback(e.target.value.slice(0, 500))}
              rows={4}
              placeholder="Share your experience with this operator."
              className="mt-2 w-full rounded-xl px-3 py-2 text-sm resize-none"
              style={{
                background: 'var(--tg-bg-alt)',
                border: '1px solid var(--tg-border)',
                color: 'var(--tg-text)',
              }}
              disabled={ratingSubmitting}
            />
            <p className="mt-1 text-[11px] text-muted-theme text-right">
              {ratingFeedback.length}/500
            </p>
          </div>

          {ratingError && (
            <p className="mt-2 text-xs font-medium" style={{ color: '#ef4444' }}>
              {ratingError}
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowRatingModal(false)}
              disabled={ratingSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitOperatorRating()}
              disabled={ratingSubmitting}
            >
              {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
            </Button>
          </div>
        </div>
      </div>
    )}

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

