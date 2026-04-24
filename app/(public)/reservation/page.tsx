'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import {
  createReservationIntent,
  fetchTripSeatStatuses,
} from '@/lib/services/payment.services';
import {
  fetchActiveQueue,
  type QueueEntry,
} from '@/lib/services/queue.services';
import {
  FaChair,
  FaUser,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaShuttleVan,
  FaClock,
  FaIdBadge,
  FaArrowRight,
  FaMapPin,
  FaTimes,
  FaCheckCircle,
} from 'react-icons/fa';

/* ── Lazy-load Leaflet (SSR-safe) ────────────────────── */
const MapContainer: any = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer as any),
  { ssr: false }
);
const TileLayer: any = dynamic(
  () => import('react-leaflet').then((m) => m.TileLayer as any),
  { ssr: false }
);
const Marker: any = dynamic(
  () => import('react-leaflet').then((m) => m.Marker as any),
  { ssr: false }
);

/* Stadia Maps tile URL (Alidade Smooth — modern, clean design) */
const STADIA_TILE_URL =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=009859a0-03ac-47da-835c-e5886a772e96';
const STADIA_DARK_URL =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=009859a0-03ac-47da-835c-e5886a772e96';

/* ── Types ─────────────────────────────────────────────── */
type SeatStatus = 'available' | 'occupied' | 'reserved';

interface Seat {
  id: number;
  label: string;
  status: SeatStatus;
}

/* ── Mock data ─────────────────────────────────────────── */
const VAN_INFO = {
  plate: 'ABC-1234',
  driver: 'Juan Dela Cruz',
  capacity: 14,
  departure: '10:30 AM',
  route: 'Isabel → Ormoc City',
  fare: 150,
  downPayment: 50,
};

const INITIAL_SEATS: Seat[] = [
  // Row 0 — front (driver + 2 passengers)
  { id: 0, label: 'D', status: 'occupied' }, // driver
  { id: 1, label: '1', status: 'available' },
  { id: 2, label: '2', status: 'available' },
  // Row 1
  { id: 3, label: '3', status: 'available' },
  { id: 4, label: '4', status: 'available' },
  { id: 5, label: '5', status: 'available' },
  // Row 2
  { id: 6, label: '6', status: 'available' },
  { id: 7, label: '7', status: 'available' },
  { id: 8, label: '8', status: 'available' },
  // Row 3
  { id: 9, label: '9', status: 'available' },
  { id: 10, label: '10', status: 'available' },
  { id: 11, label: '11', status: 'available' },
  // Row 4 — back
  { id: 12, label: '12', status: 'available' },
  { id: 13, label: '13', status: 'available' },
  { id: 14, label: '14', status: 'available' },
];

const SEAT_GRID = [
  [0, 1, 2], // Front: Driver | Passenger 1 | Passenger 2
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
  [12, 13, 14], // Back row
];

const LEGEND = [
  { cls: 'seat-available', label: 'Available' },
  { cls: 'seat-occupied', label: 'Occupied' },
  { cls: 'seat-reserved', label: 'Reserved' },
  { cls: 'seat-selected', label: 'Selected' },
];

const toStatusLabel = (status?: string) => {
  if (!status) return 'No Van Yet';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const normalizePhMobile = (value: string) => {
  const digits = value.replace(/\D/g, '');

  let local = '';
  if (digits.startsWith('63')) {
    local = digits.slice(2);
  } else if (digits.startsWith('0')) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  if (local.startsWith('9')) {
    local = local.slice(0, 10);
  } else if (local.length > 0) {
    local = `9${local.slice(0, 9)}`;
  }

  return `+63${local}`;
};

const isValidPhMobile = (value: string) => /^\+639\d{9}$/.test(value.trim());
const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/* ── Map click handler (loaded only client-side) ───────── */
function LocationPicker({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  const { useMapEvents } = require('react-leaflet');
  useMapEvents({
    click(e: any) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/* ── Re-center map when coords change ──────────────────── */
function MapUpdater({ coords }: { coords: [number, number] | null }) {
  const { useMap } = require('react-leaflet');
  const map = useMap();
  useEffect(() => {
    if (coords) map.setView(coords, map.getZoom(), { animate: true });
  }, [coords, map]);
  return null;
}

/* ══════════════════════════════════════════════════════════
   RESERVATION PAGE
══════════════════════════════════════════════════════════ */
const ReservationPage = () => {
  const [seats, setSeats] = useState<Seat[]>(INITIAL_SEATS);
  const [selectedSeatIds, setSelectedSeatIds] = useState<number[]>([]);
  const [fullName, setFullName] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('+63');
  const [pickupLocation, setPickupLocation] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [mapCoords, setMapCoords] = useState<[number, number] | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  useEffect(() => {
    const loadQueue = async () => {
      try {
        const items = await fetchActiveQueue();
        setQueue(items);
        if (items.length > 0) setSelectedQueueId(items[0].id);
      } catch {
        setQueue([]);
      } finally {
        setLoadingQueue(false);
      }
    };
    loadQueue();
  }, []);

  // Fix Leaflet default icon in Next.js
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const L = require('leaflet');
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    }
  }, []);

  const handleSeatClick = (seat: Seat) => {
    if (!hasActiveVan) return;
    if (seat.status === 'occupied' || seat.status === 'reserved') return;
    setSelectedSeatIds(
      (prev) =>
        prev.includes(seat.id)
          ? prev.filter((id) => id !== seat.id) // deselect
          : [...prev, seat.id] // select
    );
  };

  const getSeatClass = (seat: Seat) => {
    if (selectedSeatIds.includes(seat.id)) return 'seat-btn seat-selected';
    return `seat-btn seat-${seat.status}`;
  };

  const selectedSeats = useMemo(
    () => seats.filter((s) => selectedSeatIds.includes(s.id)),
    [seats, selectedSeatIds]
  );

  const totalFare = selectedSeats.length * VAN_INFO.fare;
  const totalDown = selectedSeats.length * VAN_INFO.downPayment;

  // Track whether the pickup text was set by a map click (skip geocoding)
  const fromMapClick = useRef(false);

  const handleMapPick = async (lat: number, lng: number) => {
    fromMapClick.current = true;
    setMapCoords([lat, lng]);
    setPickupLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`); // show coords immediately

    // Reverse-geocode to get readable address
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      const data = await res.json();
      if (data.display_name) {
        fromMapClick.current = true;
        setPickupLocation(data.display_name);
      }
    } catch {
      /* keep the coordinates if geocoding fails */
    }
  };

  // Geocode the typed pickup location (debounced 800ms)
  useEffect(() => {
    if (fromMapClick.current) {
      fromMapClick.current = false;
      return; // skip geocoding when text was set by map click
    }
    const query = pickupLocation.trim();
    if (query.length < 3) return;

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Leyte, Philippines')}&limit=1`
        );
        const data = await res.json();
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          setMapCoords([lat, lng]);
        }
      } catch {
        /* ignore geocoding errors */
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [pickupLocation]);

  const selectedQueue = queue.find((q) => q.id === selectedQueueId) || null;
  const firstInLine = useMemo(() => {
    if (!queue.length) return null;
    return [...queue].sort((a, b) => a.position - b.position)[0] || null;
  }, [queue]);
  const hasActiveVan = !!selectedQueue;
  const isSelectedVanBoarding =
    selectedQueue?.status?.toLowerCase() === 'boarding';
  const activeRoute = selectedQueue?.route || VAN_INFO.route;
  const activeDeparture = selectedQueue?.departure || VAN_INFO.departure;
  const tripDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const tripKey = `${activeRoute}|${activeDeparture}|${tripDate}`;

  useEffect(() => {
    if (!hasActiveVan) {
      setSeats(INITIAL_SEATS);
      setSelectedSeatIds([]);
      return;
    }

    let cancelled = false;
    const loadSeatStatuses = async () => {
      try {
        const data = await fetchTripSeatStatuses(tripKey, selectedQueue?.id || null);
        const locked = new Set(data.locked_seats || []);
        const reserved = new Set(data.reserved_seats || []);
        const occupied = new Set(data.occupied_seats || []);

        const nextSeats = INITIAL_SEATS.map((seat) => {
          if (seat.label === 'D') return seat;
          const isOccupied = occupied.has(seat.label);
          const isReserved = locked.has(seat.label) || reserved.has(seat.label);
          return {
            ...seat,
            status: isOccupied
              ? ('occupied' as SeatStatus)
              : isReserved
                ? ('reserved' as SeatStatus)
                : ('available' as SeatStatus),
          };
        });

        if (cancelled) return;
        setSeats(nextSeats);
        setSelectedSeatIds((prev) =>
          prev.filter((id) => {
            const currentSeat = nextSeats.find((s) => s.id === id);
            return !!currentSeat && currentSeat.status === 'available';
          })
        );
      } catch {
        if (!cancelled) setSeats(INITIAL_SEATS);
      }
    };

    loadSeatStatuses();
    const timer = setInterval(loadSeatStatuses, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hasActiveVan, tripKey, selectedQueue?.id]);

  const isFormValid =
    fullName.trim() &&
    isValidEmail(passengerEmail) &&
    isValidPhMobile(contactNumber) &&
    pickupLocation.trim() &&
    selectedSeats.length > 0 &&
    hasActiveVan;

  const submitReservation = async () => {
    if (!isFormValid || isPaying) return;
    setIsPaying(true);
    setPayError('');

    try {
      const intent = await createReservationIntent({
        fullName,
        passengerEmail: passengerEmail.trim().toLowerCase(),
        contactNumber,
        pickupLocation,
        route: activeRoute,
        seatLabels: selectedSeats.map((s) => s.label),
        amount: totalDown,
        tripKey,
        queueId: selectedQueue?.id,
        operatorUserId: selectedQueue?.operatorUserId,
      });

      window.location.href = `/reservation/status?reservation_id=${encodeURIComponent(
        intent.reservation_id
      )}&reservation_token=${encodeURIComponent(
        intent.guest_token
      )}&reserved=success`;
    } catch (error: any) {
      setPayError(error?.message || 'Network error. Please try again.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <main>
      {/* Hero */}
      <section className="relative pt-36 pb-16 px-6">
        <div
          className="max-w-3xl mx-auto text-center"
          data-aos="fade-up"
          suppressHydrationWarning
        >
          <div className="section-badge mx-auto mb-5">Seat Reservation</div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
            Reserve Your{' '}
            <span className="text-gradient" style={{ fontStyle: 'italic' }}>
              Seat
            </span>
          </h1>
          <p className="mt-4 text-muted-theme text-lg max-w-xl mx-auto">
            Pick your preferred seat and submit your request. Downpayment is only
            required after operator confirmation.
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="pb-28 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ── LEFT COLUMN: Van Info + Seat Map ─────── */}
          <div
            className="lg:col-span-5 flex flex-col gap-6"
            data-aos="fade-right"
            suppressHydrationWarning
          >
            {/* Van info card */}
            <div className="card-glow p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="icon-badge">
                  <FaShuttleVan />
                </div>
                <div>
                  <h3 className="text-theme font-bold text-lg">Current Van</h3>
                  <p className="text-muted-theme text-xs uppercase tracking-wider font-semibold">
                    {activeRoute}
                  </p>
                </div>
                <span className="step-badge ml-auto flex items-center gap-1.5">
                  {isSelectedVanBoarding && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                  )}
                  {toStatusLabel(selectedQueue?.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <FaIdBadge style={{ color: 'var(--primary)' }} size={13} />
                  <span className="text-muted-theme">Plate:</span>
                  <span className="text-theme font-semibold">
                    {selectedQueue?.plate || '--'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FaUser style={{ color: 'var(--primary)' }} size={13} />
                  <span className="text-muted-theme">Driver:</span>
                  <span className="text-theme font-semibold">
                    {selectedQueue?.driver || '--'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FaChair style={{ color: 'var(--primary)' }} size={13} />
                  <span className="text-muted-theme">Seats:</span>
                  <span className="text-theme font-semibold">
                    {VAN_INFO.capacity}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FaClock style={{ color: 'var(--primary)' }} size={13} />
                  <span className="text-muted-theme">Depart:</span>
                  <span className="text-theme font-semibold">
                    {selectedQueue?.departure || '--'}
                  </span>
                </div>
              </div>
              <div
                className="mt-4 p-3 rounded-xl text-sm"
                style={{
                  background: 'var(--tg-bg-alt)',
                  border: '1px solid var(--tg-border)',
                }}
              >
                <p className="text-xs text-muted-theme uppercase tracking-wider font-semibold mb-1">
                  Van In Line #1
                </p>
                {firstInLine ? (
                  <p className="text-theme font-semibold">
                    {firstInLine.plate} - {firstInLine.driver}
                    <span className="text-muted-theme font-normal">
                      {' '}
                      ({firstInLine.operatorName})
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-theme">No van in line yet</p>
                )}
              </div>
            </div>

            {/* Seat map */}
            <div className="card-glow p-6 rounded-2xl">
              <h3 className="text-theme font-bold text-lg mb-1">
                Select Your Seat
              </h3>
              <p className="text-muted-theme text-xs mb-5">
                {hasActiveVan
                  ? 'Tap an available seat to select it'
                  : 'Seat selection is disabled until a van is in queue'}
              </p>

              {/* Van shape */}
              <div
                className="relative p-4 rounded-2xl"
                style={{
                  background: 'var(--tg-bg-alt)',
                  border: '2px solid var(--tg-border)',
                }}
              >
                {/* Front label */}
                <div className="text-center text-xs font-bold text-muted-theme uppercase tracking-widest mb-3">
                  ▲ Front
                </div>

                <div className="flex flex-col items-center gap-2">
                  {SEAT_GRID.map((row, ri) => (
                    <div key={ri} className="flex gap-2 justify-center">
                      {row.map((seatId, ci) => {
                        if (seatId === null)
                          return (
                            <div
                              key={`gap-${ri}-${ci}`}
                              className="w-12 h-12"
                            />
                          );
                        const seat = seats[seatId];
                        const isDriver = seat.label === 'D';
                        const seatUnavailable = !hasActiveVan || isDriver;
                        const isSeatBlocked =
                          seat.status === 'occupied' ||
                          seat.status === 'reserved';
                        return (
                          <button
                            key={seatId}
                            onClick={() => {
                              if (seatUnavailable) return;
                              handleSeatClick(seat);
                            }}
                            disabled={seatUnavailable || isSeatBlocked}
                            className={`${isDriver ? 'seat-btn seat-occupied' : getSeatClass(seat)} ${!hasActiveVan ? 'opacity-60 cursor-not-allowed' : ''}`}
                            title={
                              !hasActiveVan
                                ? 'No active van in queue'
                                : isDriver
                                  ? 'Driver'
                                  : `Seat ${seat.label} - ${selectedSeatIds.includes(seat.id) ? 'Selected' : seat.status}`
                            }
                          >
                            {isDriver ? 'D' : seat.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="text-center text-xs font-bold text-muted-theme uppercase tracking-widest mt-3">
                  ▼ Back
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-5 justify-center">
                {LEGEND.map((l) => (
                  <div
                    key={l.label}
                    className="flex items-center gap-2 text-xs text-muted-theme"
                  >
                    <div className={`seat-legend-dot ${l.cls}`} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Van queue */}
            <div className="card-glow p-6 rounded-2xl">
              <h3 className="text-theme font-bold text-lg mb-4 flex items-center gap-2">
                <FaShuttleVan style={{ color: 'var(--primary)' }} /> Van Line
                Queue
              </h3>
              {loadingQueue ? (
                <div className="flex justify-center py-8">
                  <svg
                    className="animate-spin h-7 w-7"
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
              ) : queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="icon-badge w-14 h-14 text-2xl opacity-40">
                    <FaShuttleVan />
                  </div>
                  <p className="text-muted-theme text-sm font-medium">
                    No van in line
                  </p>
                  <p className="text-muted-theme text-xs">
                    Check back shortly for the next available van
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queue.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedQueueId(v.id)}
                      className="w-full text-left flex items-center gap-4 p-3 rounded-xl transition-all cursor-pointer"
                      style={{
                        background:
                          selectedQueueId === v.id
                            ? 'var(--tg-subtle)'
                            : 'transparent',
                        border:
                          selectedQueueId === v.id
                            ? '1px solid var(--tg-border-primary)'
                            : '1px solid var(--tg-border)',
                      }}
                    >
                      <div className="icon-badge w-9 h-9 text-sm">
                        <FaShuttleVan />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-theme font-semibold text-sm">
                          #{v.position} {v.plate}
                        </p>
                        <p className="text-muted-theme text-xs">
                          {v.driver} - {v.departure}
                        </p>
                        <p className="text-muted-theme text-[11px] truncate">
                          Operator:{' '}
                          <span className="text-theme font-medium">
                            {v.operatorName}
                          </span>
                          {v.operatorEmail ? ` (${v.operatorEmail})` : ''}
                        </p>
                      </div>
                      <span
                        className={`step-badge text-xs ${v.status?.toLowerCase() === 'boarding' ? '' : 'opacity-60'}`}
                      >
                        {v.status?.toLowerCase() === 'boarding' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse mr-1.5 inline-block" />
                        )}
                        {toStatusLabel(v.status)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Form + Payment ─────────── */}
          <div
            className="lg:col-span-7 flex flex-col gap-6"
            data-aos="fade-left"
            suppressHydrationWarning
          >
            {/* Commuter details form */}
            <div className="card-glow p-6 md:p-8 rounded-2xl">
              <h2 className="text-theme font-bold text-xl mb-1">
                Commuter Details
              </h2>
              <p className="text-muted-theme text-sm mb-6">
                Enter your info to complete the reservation
              </p>

              <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                {/* Selected seats display */}
                <div
                  className="p-4 rounded-xl"
                  style={{
                    background: 'var(--tg-bg-alt)',
                    border: '1px solid var(--tg-border)',
                  }}
                >
                  <p className="text-xs text-muted-theme font-semibold uppercase tracking-wider mb-2">
                    Selected Seat{selectedSeats.length !== 1 ? 's' : ''} (
                    {selectedSeats.length})
                  </p>
                  {selectedSeats.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedSeats.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleSeatClick(s)}
                          className="seat-btn seat-selected text-xs"
                          title={`Remove Seat ${s.label}`}
                        >
                          {s.label} <FaTimes size={8} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-theme text-sm">
                      No seat selected — tap seats on the map
                    </p>
                  )}
                </div>

                {/* Full name */}
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    <FaUser
                      className="inline mr-1.5"
                      style={{ color: 'var(--primary)' }}
                      size={11}
                    />
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Juan Dela Cruz"
                    className="input-dark"
                  />
                </div>

                {/* Contact number */}
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    <FaPhone
                      className="inline mr-1.5"
                      style={{ color: 'var(--primary)' }}
                      size={11}
                    />
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) =>
                      setContactNumber(normalizePhMobile(e.target.value))
                    }
                    placeholder="+639123456789"
                    pattern="^\+639\d{9}$"
                    title="Use PH mobile format: +639123456789"
                    maxLength={13}
                    className="input-dark"
                  />
                </div>

                {/* Passenger email */}
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    <FaEnvelope
                      className="inline mr-1.5"
                      style={{ color: 'var(--primary)' }}
                      size={11}
                    />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={passengerEmail}
                    onChange={(e) => setPassengerEmail(e.target.value.trim())}
                    placeholder="you@email.com"
                    className="input-dark"
                  />
                </div>

                {/* Pickup location */}
                <div>
                  <label className="block text-xs font-semibold text-muted-theme uppercase tracking-wider mb-2">
                    <FaMapMarkerAlt
                      className="inline mr-1.5"
                      style={{ color: 'var(--primary)' }}
                      size={11}
                    />
                    Pickup Location
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pickupLocation}
                      onChange={(e) => setPickupLocation(e.target.value)}
                      placeholder="Enter address or pin on map"
                      className="input-dark flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMap(!showMap)}
                      className={`btn-outline text-sm shrink-0 gap-1.5 ${showMap ? '!border-[var(--primary)] !text-[var(--primary)]' : ''}`}
                    >
                      <FaMapPin size={13} /> {showMap ? 'Hide' : 'Pin'}
                    </button>
                  </div>
                </div>

                {/* Map — Leaflet + Stadia tiles (toggleable) */}
                {showMap && (
                  <div
                    className="rounded-2xl overflow-hidden"
                    data-aos="fade-up"
                    suppressHydrationWarning
                  >
                    <MapContainer
                      center={mapCoords || [11.004, 124.4385]} // Isabel Integrated Bus Terminal
                      zoom={14}
                      scrollWheelZoom={true}
                      style={{ height: 280 }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
                        url={STADIA_DARK_URL}
                      />
                      <LocationPicker onPick={handleMapPick} />
                      <MapUpdater coords={mapCoords} />
                      {mapCoords && <Marker position={mapCoords} />}
                    </MapContainer>
                    <p className="text-center text-xs text-muted-theme mt-2">
                      Tap on the map to pin your pickup location
                    </p>
                  </div>
                )}
              </form>
            </div>

            {/* Reservation summary */}
            <div className="card-glow p-6 md:p-8 rounded-2xl">
              <h2 className="text-theme font-bold text-xl mb-1 flex items-center gap-2">
                <FaMoneyBillWave style={{ color: 'var(--primary)' }} /> Reservation
                Summary
              </h2>
              <p className="text-muted-theme text-sm mb-5">
                Review your booking before submitting your request
              </p>

              <div className="mb-6">
                <div className="summary-row">
                  <span className="label">Route</span>
                  <span className="value">{activeRoute}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Seat(s)</span>
                  <span className="value">
                    {selectedSeats.length > 0
                      ? selectedSeats.map((s) => s.label).join(', ')
                      : '—'}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="label">No. of Seats</span>
                  <span className="value">{selectedSeats.length || '—'}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Passenger</span>
                  <span className="value">{fullName || '—'}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Contact</span>
                  <span className="value">{contactNumber || '—'}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Email</span>
                  <span className="value">{passengerEmail || '—'}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Pickup</span>
                  <span className="value text-right max-w-[200px] truncate">
                    {pickupLocation || '—'}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="label">Fare per Seat</span>
                  <span className="value">₱{VAN_INFO.fare.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span className="label">Total Fare</span>
                  <span className="value">₱{totalFare.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span className="label text-theme font-semibold">
                    Down Payment
                  </span>
                  <span
                    className="value text-xl"
                    style={{ color: 'var(--primary)' }}
                  >
                    ₱{totalDown.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => void submitReservation()}
                disabled={!isFormValid || isPaying}
                className="btn-primary  w-full text-base group"
                style={
                  !isFormValid || isPaying
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : {}
                }
              >
                {isPaying ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
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
                    Processing…
                  </>
                ) : (
                  <>
                    <FaMoneyBillWave /> Submit Reservation Request
                    <FaArrowRight
                      size={14}
                      className="ml-auto group-hover:translate-x-1 transition-transform"
                    />
                  </>
                )}
              </button>

              {payError && (
                <p
                  className="mt-3 text-center text-xs font-medium"
                  style={{ color: '#ef4444' }}
                >
                  {payError}
                </p>
              )}

              <p className="mt-3 text-center text-xs text-muted-theme flex items-center justify-center gap-1.5">
                <FaCheckCircle style={{ color: 'var(--primary)' }} size={11} />
                Downpayment will be requested once the operator confirms your request
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ReservationPage;
