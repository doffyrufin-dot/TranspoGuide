'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import {
  AlertCircle,
  Bus,
  Calendar,
} from 'lucide-react';
import sileoToast from '@/lib/utils/sileo-toast';

type StatItem = {
  title: string;
  value: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
};

type Props = {
  currentTheme: string;
  accessToken: string;
};

type OverviewResponse = {
  stats: {
    totalBookings: number;
    activeVans: number;
    totalRevenue: number;
    weeklyRevenue: number;
    pendingIssues: number;
  };
  weekly: {
    labels: string[];
    bookings: number[];
    revenue: number[];
  };
};

const fallbackData: OverviewResponse = {
  stats: {
    totalBookings: 0,
    activeVans: 0,
    totalRevenue: 0,
    weeklyRevenue: 0,
    pendingIssues: 0,
  },
  weekly: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    bookings: [0, 0, 0, 0, 0, 0, 0],
    revenue: [0, 0, 0, 0, 0, 0, 0],
  },
};

export default function OverviewTab({ currentTheme, accessToken }: Props) {
  const isDark = currentTheme === 'dark';
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewResponse>(fallbackData);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const loadOverview = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/overview', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const data = (await res.json()) as OverviewResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load overview data.');
        }
        if (cancelled) return;
        setOverview(data);
      } catch (error: any) {
        if (cancelled) return;
        setOverview(fallbackData);
        sileoToast.error({
          title: 'Overview load failed',
          description: error?.message || 'Please try again.',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const stats: StatItem[] = useMemo(
    () => [
      {
        title: 'Total Bookings',
        value: String(overview.stats.totalBookings || 0),
        icon: Calendar,
        color: '#2597E9',
      },
      {
        title: 'Active Vans',
        value: String(overview.stats.activeVans || 0),
        icon: Bus,
        color: '#22c55e',
      },
      {
        title: 'Pending Issues',
        value: String(overview.stats.pendingIssues || 0),
        icon: AlertCircle,
        color: '#f59e0b',
      },
    ],
    [overview.stats]
  );

  const labels = overview.weekly.labels?.length
    ? overview.weekly.labels
    : fallbackData.weekly.labels;
  const lineData = [
    {
      id: 'Bookings',
      color: '#2597E9',
      data: labels.map((label, index) => ({
        x: label,
        y: Number(overview.weekly.bookings?.[index] || 0),
      })),
    },
    {
      id: 'Revenue',
      color: '#22c55e',
      data: labels.map((label, index) => ({
        x: label,
        y: Number(overview.weekly.revenue?.[index] || 0),
      })),
    },
  ];

  const chartTheme = {
    text: { fill: isDark ? '#8b96a8' : '#64748b', fontSize: 12 },
    axis: {
      ticks: { text: { fill: isDark ? '#8b96a8' : '#94a3b8' } },
      domain: { line: { stroke: 'transparent' } },
    },
    grid: {
      line: { stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
    },
    crosshair: {
      line: {
        stroke: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
        strokeDasharray: '4 4',
      },
    },
    tooltip: {
      container: {
        background: isDark ? '#142035' : '#ffffff',
        color: isDark ? '#f0f4f8' : '#1a1c1e',
        borderRadius: '12px',
        border: isDark
          ? '1px solid rgba(255,255,255,0.1)'
          : '1px solid rgba(0,0,0,0.08)',
        boxShadow: isDark
          ? '0 8px 32px rgba(0,0,0,0.4)'
          : '0 4px 20px rgba(0,0,0,0.1)',
        fontSize: '13px',
        padding: '10px 14px',
      },
    },
  };

  return (
    <div className="admin-tab space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="card-glow p-5 rounded-2xl flex items-center gap-4"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background: `${stat.color}18`, color: stat.color }}
            >
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-xs text-muted-theme font-medium">{stat.title}</p>
              <h3 className="text-2xl font-extrabold text-theme">
                {loading ? '...' : stat.value}
              </h3>
            </div>
          </div>
        ))}
      </div>

      <div className="card-glow p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-theme font-bold text-lg">Weekly Statistics</h3>
            <p className="text-muted-theme text-sm">
              {loading ? 'Loading live data...' : 'Bookings & Revenue overview'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-theme">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: '#2597E9' }} /> Bookings
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} /> Revenue
            </span>
          </div>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveLine
            data={lineData}
            margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: 'auto' }}
            curve="catmullRom"
            colors={['#2597E9', '#22c55e']}
            lineWidth={3}
            enablePoints
            pointSize={8}
            pointColor={{ from: 'color' }}
            pointBorderWidth={2}
            pointBorderColor={isDark ? '#142035' : '#ffffff'}
            enableArea
            areaOpacity={0.08}
            enableGridX={false}
            enableGridY
            gridYValues={5}
            axisBottom={{
              tickSize: 0,
              tickPadding: 12,
            }}
            axisLeft={{
              tickSize: 0,
              tickPadding: 12,
              tickValues: 5,
            }}
            useMesh
            enableCrosshair
            crosshairType="bottom-left"
            theme={chartTheme}
            animate
            motionConfig="gentle"
          />
        </div>
      </div>

      <div className="card-glow p-6 rounded-2xl">
        <h3 className="text-theme font-bold text-lg mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[
            {
              text: 'Juan Dela Cruz booked 2 seats on Isabel to Ormoc',
              time: '2 min ago',
              color: '#2597E9',
            },
            {
              text: 'Van HAE-123 departed with 14 passengers',
              time: '15 min ago',
              color: '#22c55e',
            },
            {
              text: 'New operator application from Maria Santos',
              time: '1 hr ago',
              color: '#f59e0b',
            },
            {
              text: 'Payment of P1,200 received via GCash',
              time: '2 hrs ago',
              color: '#a855f7',
            },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}
            >
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: item.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-theme text-sm">{item.text}</p>
                <p className="text-muted-theme text-xs mt-0.5">{item.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
