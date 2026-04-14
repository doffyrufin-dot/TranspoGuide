'use client';

import React from 'react';
import {
  FaArrowRight,
  FaChevronDown,
  FaExchangeAlt,
  FaMapMarkerAlt,
  FaSearch,
} from 'react-icons/fa';
import { FadeIn } from '@/components/ui/motion';
import { iconForVehicle } from '../lib/route-ui';

type RouteSearchPanelProps = {
  vehicle: string;
  origin: string;
  destination: string;
  vehicleTypes: string[];
  origins: string[];
  destinations: string[];
  onVehicleChange: (value: string) => void;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwap: () => void;
  onSearch: () => void;
};

export default function RouteSearchPanel({
  vehicle,
  origin,
  destination,
  vehicleTypes,
  origins,
  destinations,
  onVehicleChange,
  onOriginChange,
  onDestinationChange,
  onSwap,
  onSearch,
}: RouteSearchPanelProps) {
  return (
    <section className="relative pt-36 pb-20 px-6">
      <FadeIn className="max-w-4xl mx-auto text-center">
        <div className="section-badge mx-auto mb-5">Route Finder</div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-theme leading-tight">
          Find Your{' '}
          <span className="text-gradient" style={{ fontStyle: 'italic' }}>
            Fastest Route
          </span>
        </h1>
        <p className="mt-4 text-muted-theme text-lg max-w-xl mx-auto">
          Search routes and compare fares using your admin-configured route
          matrix.
        </p>
      </FadeIn>

      <FadeIn className="max-w-3xl mx-auto mt-10" delay={0.08}>
        <div className="card-glow p-6 md:p-8 rounded-2xl">
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => onVehicleChange('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${vehicle === 'all' ? 'btn-primary shadow-none py-1.5 px-4' : ''}`}
              style={
                vehicle !== 'all'
                  ? {
                      background: 'var(--tg-subtle)',
                      border: '1px solid var(--tg-border-primary)',
                      color: 'var(--primary)',
                    }
                  : {}
              }
            >
              All Types
            </button>
            {vehicleTypes.map((label) => (
              <button
                key={label}
                onClick={() => onVehicleChange(label)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-all cursor-pointer ${vehicle === label ? 'btn-primary shadow-none py-1.5 px-4' : ''}`}
                style={
                  vehicle !== label
                    ? {
                        background: 'var(--tg-subtle)',
                        border: '1px solid var(--tg-border-primary)',
                        color: 'var(--primary)',
                      }
                    : {}
                }
              >
                <span className="text-xs">{iconForVehicle(label)}</span>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <div className="relative">
              <div className="input-dark pl-3 pr-9 flex items-center gap-2">
                <FaMapMarkerAlt
                  className="text-sm shrink-0"
                  style={{ color: 'var(--primary)' }}
                />
                <select
                  value={origin}
                  onChange={(e) => onOriginChange(e.target.value)}
                  className="w-full bg-transparent outline-none border-0 text-theme appearance-none"
                  style={
                    {
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                    } as React.CSSProperties
                  }
                >
                  <option
                    value=""
                    className="bg-white dark:bg-gray-800 text-black dark:text-white"
                  >
                    All Origins
                  </option>
                  {origins.map((o) => (
                    <option
                      className="bg-white dark:bg-gray-800 text-black dark:text-white"
                      key={o}
                      value={o}
                    >
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <FaChevronDown
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                style={{ color: 'var(--tg-muted)' }}
              />
            </div>

            <button
              onClick={onSwap}
              className="theme-toggle mx-auto"
              title="Swap"
              style={{ color: 'var(--primary)' }}
            >
              <FaExchangeAlt size={13} />
            </button>

            <div className="relative">
              <div className="input-dark pl-3 pr-9 flex items-center gap-2">
                <FaMapMarkerAlt
                  className="text-sm shrink-0"
                  style={{ color: 'var(--primary)' }}
                />
                <select
                  value={destination}
                  onChange={(e) => onDestinationChange(e.target.value)}
                  className="w-full bg-transparent outline-none border-0 text-theme appearance-none"
                  style={
                    {
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                    } as React.CSSProperties
                  }
                >
                  <option
                    value=""
                    className="bg-white dark:bg-gray-800 text-black dark:text-white"
                  >
                    All Destinations
                  </option>
                  {destinations.map((d) => (
                    <option
                      className="bg-white dark:bg-gray-800 text-black dark:text-white"
                      key={d}
                      value={d}
                    >
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <FaChevronDown
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                style={{ color: 'var(--tg-muted)' }}
              />
            </div>
          </div>

          <button
            className="btn-primary w-full text-base mt-5 group"
            type="button"
            onClick={onSearch}
          >
            <FaSearch size={14} /> Search Routes{' '}
            <FaArrowRight
              size={13}
              className="ml-auto group-hover:translate-x-1 transition-transform"
            />
          </button>
        </div>
      </FadeIn>
    </section>
  );
}

