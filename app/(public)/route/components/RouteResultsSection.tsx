'use client';

import React from 'react';
import Image from 'next/image';
import { FaClock } from 'react-icons/fa';
import { iconForVehicle } from '../lib/route-ui';
import { resolveVehicleImageUrl } from '@/lib/utils/vehicle-image';
import {
  type RouteFareRow,
  type RouteMetric,
  formatTravelTime,
  getAverageSpeedKph,
  getDistanceKm,
  imageForVehicle,
  normalizeRouteKey,
} from '../lib/route-search';

type RouteResultsSectionProps = {
  show: boolean;
  loading: boolean;
  loadError: string;
  rows: RouteFareRow[];
  metricsByKey: Record<string, RouteMetric>;
  metricsLoading: boolean;
};

export default function RouteResultsSection({
  show,
  loading,
  loadError,
  rows,
  metricsByKey,
  metricsLoading,
}: RouteResultsSectionProps) {
  if (!show) return null;
  const hasDiscountedRows = rows.some(
    (row) =>
      row.source !== 'barangay_fare' && Number(row.discount_rate || 0) > 0
  );
  const gridClassName =
    rows.length === 1
      ? 'grid grid-cols-1 gap-5 max-w-sm mx-auto'
      : rows.length === 2
        ? 'grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-3xl mx-auto'
        : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5';

  return (
    <section className="px-6 pb-28">
      <div className="max-w-5xl mx-auto">
        {loading ? (
          <div className="card-glow rounded-2xl p-10 text-center text-muted-theme text-sm">
            Loading route results...
          </div>
        ) : loadError ? (
          <div className="card-glow rounded-2xl p-10 text-center text-sm text-theme">
            {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div className="card-glow rounded-2xl p-10 text-center text-muted-theme text-sm">
            No routes found for your current filters.
          </div>
        ) : (
          <div className="space-y-3">
            {hasDiscountedRows && (
              <div
                className="text-sm md:text-base font-semibold text-center max-w-3xl mx-auto"
                style={{ color: 'var(--tg-text)' }}
              >
                Discounted fare applies only to Students, Seniors, Pregnant,
                and PWD passengers.
              </div>
            )}
            {metricsLoading && (
              <div className="text-xs text-muted-theme text-center py-2">
                <div className="inline-flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                  Fetching latest distance and travel time...
                </div>
              </div>
            )}
            <div className={gridClassName}>
              {rows.map((r, index) => {
                const regularFare = Number(r.regular_fare || 0);
                const discountRate = Number(r.discount_rate || 0);
                const discounted = regularFare * (1 - discountRate);
                const savings = regularFare - discounted;
                const showDiscounted = r.source !== 'barangay_fare';
                const key = normalizeRouteKey(
                  r.origin,
                  r.destination,
                  r.vehicle_type
                );
                const metric = metricsByKey[key];
                const distanceKm = metric?.distance_km ?? getDistanceKm(r);
                const estimatedMinutes =
                  metric?.duration_minutes ??
                  (distanceKm > 0
                    ? (distanceKm / getAverageSpeedKph(r.vehicle_type)) * 60
                    : 0);
                return (
                  <div key={r.id}>
                    <div
                      className="rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1"
                      style={{
                        background: 'var(--tg-bg-alt)',
                        border: '1px solid var(--tg-border)',
                        boxShadow: 'var(--tg-shadow)',
                      }}
                    >
                      <div
                        className="h-40 w-full"
                        style={{ background: 'var(--tg-subtle)' }}
                      >
                        <Image
                          src={
                            resolveVehicleImageUrl(r.vehicle_image_url) ||
                            imageForVehicle(r.vehicle_type)
                          }
                          alt={r.vehicle_type}
                          width={640}
                          height={320}
                          className="w-full h-full object-cover"
                          loading={index < 2 ? 'eager' : 'lazy'}
                          priority={index < 2}
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>

                      <div className="p-4 md:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-theme font-bold text-xl">
                              {r.vehicle_type}
                            </p>
                            <p className="text-muted-theme text-sm mt-1">
                              {r.origin} to {r.destination}
                            </p>
                          </div>
                          <span
                            className="text-sm"
                            style={{ color: 'var(--primary)' }}
                          >
                            {iconForVehicle(r.vehicle_type)}
                          </span>
                        </div>

                        <div className="mt-4 space-y-1">
                          <p className="text-muted-theme text-sm">
                            Regular:{' '}
                            <span className="text-theme font-semibold">
                              P{regularFare.toFixed(2)}
                            </span>
                          </p>
                          {showDiscounted && (
                            <>
                              <p className="text-muted-theme text-sm">
                                Discounted:{' '}
                                <span
                                  style={{ color: 'var(--primary)' }}
                                  className="font-bold"
                                >
                                  P{discounted.toFixed(2)}
                                </span>
                              </p>
                              <p className="text-muted-theme text-sm">
                                You save:{' '}
                                <span className="text-theme font-semibold">
                                  P{savings.toFixed(2)}
                                </span>
                              </p>
                            </>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div
                            className="rounded-lg px-3 py-2 text-xs"
                            style={{
                              background: 'var(--tg-subtle)',
                              border: '1px solid var(--tg-border)',
                            }}
                          >
                            <p className="text-muted-theme">Distance</p>
                            <p className="text-theme font-semibold">
                              {distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : '--'}
                            </p>
                          </div>
                          <div
                            className="rounded-lg px-3 py-2 text-xs"
                            style={{
                              background: 'var(--tg-subtle)',
                              border: '1px solid var(--tg-border)',
                            }}
                          >
                            <p className="text-muted-theme flex items-center gap-1">
                              <FaClock size={10} /> Travel Time
                            </p>
                            <p className="text-theme font-semibold">
                              {estimatedMinutes > 0
                                ? formatTravelTime(estimatedMinutes)
                                : '--'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
