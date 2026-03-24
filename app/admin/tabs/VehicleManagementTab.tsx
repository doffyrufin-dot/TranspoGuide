'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import sileoToast from '@/lib/utils/sileo-toast';
import {
  fetchActiveQueue,
  type QueueEntry,
} from '@/lib/services/queue.services';

type Props = {
  accessToken: string;
};

type SeatMapItem = {
  seatLabel: string;
  status: 'available' | 'locked' | 'reserved';
  passengerName: string | null;
  reservationId: string | null;
  source: 'reservation' | 'walk_in' | null;
};

export default function VehicleManagementTab({ accessToken }: Props) {
  const [queueRows, setQueueRows] = useState<QueueEntry[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [subTab, setSubTab] = useState('Live Queue');
  const [selectedQueueId, setSelectedQueueId] = useState('');
  const [seatMap, setSeatMap] = useState<SeatMapItem[]>([]);
  const [seatMapLoading, setSeatMapLoading] = useState(false);
  const [seatActionLoading, setSeatActionLoading] = useState(false);
  const [selectedSeatLabel, setSelectedSeatLabel] = useState('');
  const [walkInName, setWalkInName] = useState('');

  const tripDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const selectedQueue = queueRows.find((row) => row.id === selectedQueueId) || null;
  const tripKey =
    selectedQueue?.route && selectedQueue?.departure
      ? `${selectedQueue.route}|${selectedQueue.departure}|${tripDate}`
      : '';

  const loadQueue = async () => {
    try {
      setQueueLoading(true);
      const rows = await fetchActiveQueue();
      setQueueRows(rows || []);
      setSelectedQueueId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id || '';
      });
    } catch (err: any) {
      sileoToast.error({
        title: 'Queue load failed',
        description: err?.message || 'Unable to fetch queue.',
      });
    } finally {
      setQueueLoading(false);
    }
  };

  const loadSeatMap = async (silent = false) => {
    if (!accessToken || !selectedQueue || !tripKey) {
      setSeatMap([]);
      setSelectedSeatLabel('');
      return;
    }

    try {
      setSeatMapLoading(true);
      const params = new URLSearchParams({
        tripKey,
        operatorUserId: selectedQueue.operatorUserId,
      });
      const response = await fetch(`/api/admin/seats?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to load seat map.');
      }

      const rows = (result?.seats || []) as SeatMapItem[];
      setSeatMap(rows);
      setSelectedSeatLabel((prev) => {
        if (!prev) return prev;
        const seat = rows.find((item) => item.seatLabel === prev);
        return seat?.status === 'available' ? prev : '';
      });
    } catch (err: any) {
      if (!silent) {
        sileoToast.error({
          title: 'Seat map load failed',
          description: err?.message || 'Unable to fetch seats.',
        });
      }
    } finally {
      setSeatMapLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  useEffect(() => {
    if (!selectedQueue || !tripKey) {
      setSeatMap([]);
      setSelectedSeatLabel('');
      return;
    }

    void loadSeatMap(false);
    const timer = window.setInterval(() => {
      void loadSeatMap(true);
    }, 15000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQueueId, tripKey, accessToken]);

  const assignWalkIn = async () => {
    if (!accessToken || !selectedQueue || !tripKey) return;
    if (!selectedSeatLabel) {
      sileoToast.warning({
        title: 'Seat required',
        description: 'Please select an available seat.',
      });
      return;
    }
    if (!walkInName.trim()) {
      sileoToast.warning({
        title: 'Passenger required',
        description: 'Please input walk-in commuter name.',
      });
      return;
    }

    try {
      setSeatActionLoading(true);
      const response = await fetch('/api/admin/seats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          queueId: selectedQueue.id,
          tripKey,
          seatLabel: selectedSeatLabel,
          passengerName: walkInName.trim(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to assign walk-in seat.');
      }

      setSeatMap((result?.seats || []) as SeatMapItem[]);
      setSelectedSeatLabel('');
      setWalkInName('');
      sileoToast.success({ title: 'Walk-in seat assigned' });
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
    if (!accessToken || !selectedQueue || !tripKey) return;
    try {
      setSeatActionLoading(true);
      const response = await fetch('/api/admin/seats', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          queueId: selectedQueue.id,
          tripKey,
          seatLabel,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to release seat.');
      }

      setSeatMap((result?.seats || []) as SeatMapItem[]);
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

  return (
    <div className="admin-tab space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-theme">Dispatch Board</h1>
          <p className="text-muted-theme text-sm">Live queue and walk-in seat control</p>
        </div>
        <button
          onClick={() => void loadQueue()}
          className="btn-primary text-sm"
          disabled={queueLoading}
        >
          <Clock size={14} /> Refresh Queue
        </button>
      </div>

      <div className="flex gap-2">
        {['Live Queue', 'All Vehicles'].map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              subTab === tab ? 'text-white' : 'text-muted-theme'
            }`}
            style={
              subTab === tab
                ? { background: 'var(--primary)' }
                : { background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {subTab === 'Live Queue' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="card-glow p-4 rounded-2xl">
            <h3 className="text-theme font-bold mb-3">Active Queue</h3>
            {queueLoading ? (
              <p className="text-sm text-muted-theme">Loading queue...</p>
            ) : queueRows.length === 0 ? (
              <p className="text-sm text-muted-theme">No queued/boarding vans.</p>
            ) : (
              <div className="space-y-2">
                {queueRows.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedQueueId(row.id)}
                    className="w-full text-left p-3 rounded-xl transition cursor-pointer"
                    style={
                      selectedQueueId === row.id
                        ? {
                            background: 'rgba(37,151,233,0.14)',
                            border: '1px solid rgba(37,151,233,0.4)',
                          }
                        : {
                            background: 'var(--tg-bg-alt)',
                            border: '1px solid var(--tg-border)',
                          }
                    }
                  >
                    <p className="text-theme text-sm font-semibold">
                      #{row.position} {row.operatorName}
                    </p>
                    <p className="text-muted-theme text-xs">
                      {row.route} | {row.plate} | {row.departure || 'TBD'} | {row.status}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card-glow p-4 rounded-2xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-theme font-bold">Admin Walk-in Seat Manager</h3>
              <button
                onClick={() => void loadSeatMap(false)}
                disabled={!selectedQueue || seatMapLoading || seatActionLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                style={{
                  background: 'var(--tg-subtle)',
                  color: 'var(--primary)',
                  border: '1px solid var(--tg-border-primary)',
                  opacity: !selectedQueue || seatMapLoading || seatActionLoading ? 0.6 : 1,
                }}
              >
                Refresh Seats
              </button>
            </div>

            {!selectedQueue ? (
              <p className="text-sm text-muted-theme">Select a queued/boarding operator first.</p>
            ) : (
              <>
                <p className="text-xs text-muted-theme mb-3">
                  Operator: <span className="text-theme font-semibold">{selectedQueue.operatorName}</span> | Route:{' '}
                  <span className="text-theme font-semibold">{selectedQueue.route}</span>
                </p>

                <div
                  className="grid grid-cols-7 gap-2 mb-3 transition-opacity"
                  style={{ opacity: seatMapLoading ? 0.65 : 1 }}
                >
                  {Array.from({ length: 14 }, (_, index) => {
                    const label = String(index + 1);
                    const seat = seatMap.find((item) => item.seatLabel === label) || null;
                    const isAvailable = seat?.status === 'available';
                    const isLocked = seat?.status === 'locked';
                    const isReserved = seat?.status === 'reserved';
                    const isSelected = selectedSeatLabel === label;

                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          if (seatMapLoading || !isAvailable) return;
                          setSelectedSeatLabel((prev) => (prev === label ? '' : label));
                        }}
                        className="h-10 rounded-lg text-sm font-bold transition cursor-pointer"
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
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col md:flex-row gap-2 mb-2">
                  <input
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    placeholder="Walk-in commuter name"
                    className="input-dark w-full"
                    disabled={seatActionLoading || seatMapLoading}
                  />
                  <button
                    onClick={() => void assignWalkIn()}
                    disabled={
                      !selectedSeatLabel || !walkInName.trim() || seatActionLoading || seatMapLoading
                    }
                    className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                  >
                    Occupy Seat {selectedSeatLabel || ''}
                  </button>
                </div>

                <div className="space-y-2 mt-3">
                  {seatMap
                    .filter((seat) => seat.status !== 'available')
                    .map((seat) => (
                      <div
                        key={`admin-seat-${seat.seatLabel}`}
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
                            disabled={seatActionLoading || seatMapLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                            style={{
                              background: 'rgba(239,68,68,0.12)',
                              color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.35)',
                              opacity: seatActionLoading || seatMapLoading ? 0.6 : 1,
                            }}
                          >
                            Release
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
