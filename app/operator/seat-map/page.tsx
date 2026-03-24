'use client';

import React from 'react';
import { User, ShipWheel, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function SeatMapPage() {
  const { theme, toggle: toggleTheme } = useTheme();

  // Mock Data: 14-Seater Van (Toyota HiAce style Layout)
  const seats = [
    { id: 'P1', label: '1', status: 'occupied', passenger: 'Juan' },
    { id: 'P2', label: '2', status: 'vacant' },
    { id: 'P3', label: '3', status: 'occupied', passenger: 'Maria' },
    { id: 'P4', label: '4', status: 'occupied', passenger: 'Pedro' },
    { id: 'P5', label: '5', status: 'vacant' },
    { id: 'P6', label: '6', status: 'reserved', passenger: 'Cardo (Pending)' },
    { id: 'P7', label: '7', status: 'vacant' },
    { id: 'P8', label: '8', status: 'vacant' },
    { id: 'P9', label: '9', status: 'occupied', passenger: 'Liza' },
    { id: 'P10', label: '10', status: 'vacant' },
    { id: 'P11', label: '11', status: 'vacant' },
    { id: 'P12', label: '12', status: 'vacant' },
    { id: 'P13', label: '13', status: 'vacant' },
    { id: 'P14', label: '14', status: 'vacant' },
  ];

  const getSeatColor = (status: string) => {
    switch (status) {
      case 'occupied':
        return { background: 'var(--primary)', color: '#fff', border: '2px solid var(--primary)' };
      case 'reserved':
        return { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '2px solid rgba(245,158,11,0.4)' };
      default:
        return { background: 'var(--tg-bg-alt)', color: 'var(--primary)', border: '2px solid var(--tg-border)' };
    }
  };

  const occupiedCount = seats.filter(s => s.status === 'occupied').length;
  const reservedCount = seats.filter(s => s.status === 'reserved').length;

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: 'var(--tg-bg)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-theme">Van Seat Map</h1>
            <p className="text-muted-theme text-sm mt-1">
              Plate Number: <span className="font-bold" style={{ color: 'var(--primary)' }}>HAE-123</span> (Grandia)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:scale-110 cursor-pointer"
              style={{ background: 'var(--tg-subtle)', color: 'var(--primary)', border: '1px solid var(--tg-border-primary)' }}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {/* Legend */}
            <div className="flex gap-3 text-xs font-medium card-glow px-4 py-2.5 rounded-xl">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }} /> Vacant
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: 'var(--primary)' }} /> Occupied
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: 'rgba(245,158,11,0.3)', border: '1px solid rgba(245,158,11,0.5)' }} /> Reserved
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left: Van Seat Map */}
          <div className="flex-1 flex justify-center">
            <div className="p-8 rounded-2xl" style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
              <div className="w-[280px] rounded-[40px] p-6 relative min-h-[600px] card-glow">
                {/* Driver Area */}
                <div className="flex justify-between mb-10 pb-4" style={{ borderBottom: '1px solid var(--tg-border)' }}>
                  <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center"
                    style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)', color: 'var(--tg-muted)' }}>
                    <ShipWheel size={22} />
                    <span className="text-[9px] mt-1 font-bold uppercase">Driver</span>
                  </div>
                  {/* Seat 1 */}
                  <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center transition-all"
                    style={getSeatColor(seats[0].status)}>
                    <span className="text-lg font-bold">1</span>
                    {seats[0].status === 'occupied' && <User size={12} />}
                  </div>
                </div>

                {/* Passenger Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {seats.slice(1).map((seat) => (
                    <div key={seat.id}
                      className="relative w-full aspect-square rounded-xl flex flex-col items-center justify-center transition-all hover:scale-105 cursor-pointer"
                      style={getSeatColor(seat.status)}
                      title={seat.passenger ? `Passenger: ${seat.passenger}` : 'Available'}>
                      <span className="text-lg font-bold">{seat.label}</span>
                      {seat.status === 'occupied' && <User size={13} className="mt-0.5" />}
                      {seat.status === 'reserved' && <span className="text-[8px] font-bold uppercase mt-0.5">Hold</span>}
                    </div>
                  ))}
                </div>

                {/* Van front curve */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-1.5 rounded-b-xl"
                  style={{ background: 'var(--primary)', opacity: 0.4 }} />
              </div>
            </div>
          </div>

          {/* Right: Manifest & Stats */}
          <div className="w-full lg:w-80 space-y-4">
            {/* Passenger Manifest */}
            <div className="card-glow p-5 rounded-2xl">
              <h3 className="font-bold text-theme mb-4 text-sm">Passenger Manifest</h3>
              <ul className="space-y-2">
                {seats.filter(s => s.status !== 'vacant').map((seat) => (
                  <li key={seat.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                    style={{ background: 'var(--tg-bg-alt)', border: '1px solid var(--tg-border)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: 'var(--tg-subtle)', color: 'var(--primary)' }}>
                      {seat.label}
                    </div>
                    <div>
                      <p className="text-theme text-sm font-medium">{seat.passenger}</p>
                      <p className="text-muted-theme text-xs capitalize">{seat.status}</p>
                    </div>
                  </li>
                ))}
                {seats.filter(s => s.status !== 'vacant').length === 0 && (
                  <p className="text-muted-theme text-sm italic text-center py-4">Van is currently empty</p>
                )}
              </ul>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card-glow p-4 rounded-2xl text-center">
                <p className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider">Occupied</p>
                <p className="text-2xl font-extrabold text-theme">{occupiedCount}<span className="text-sm text-muted-theme font-normal"> /14</span></p>
              </div>
              <div className="card-glow p-4 rounded-2xl text-center">
                <p className="text-[10px] text-muted-theme font-semibold uppercase tracking-wider">Reserved</p>
                <p className="text-2xl font-extrabold" style={{ color: '#f59e0b' }}>{reservedCount}</p>
              </div>
            </div>

            {/* Available Seats */}
            <div className="p-4 rounded-2xl" style={{ background: 'var(--tg-subtle)', border: '1px solid var(--tg-border-primary)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--primary)' }}>Available Seats</p>
              <p className="text-3xl font-extrabold text-theme mt-1">
                {14 - occupiedCount - reservedCount}
                <span className="text-sm text-muted-theme font-normal"> remaining</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
