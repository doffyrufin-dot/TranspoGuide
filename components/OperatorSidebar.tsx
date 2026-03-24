'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Armchair, // Icon para sa lingkoranan
  History,
  Settings,
  LogOut,
  CarFront,
} from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/operator' },
  // Kani ang bag-o Boss:
  { icon: Armchair, label: 'Seat Map', href: '/operator/seat-map' },
  { icon: History, label: 'Transaction History', href: '/operator/history' },
  { icon: Settings, label: 'Settings', href: '/operator/settings' },
];

export default function OperatorSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col h-screen sticky top-0 border-r border-slate-800">
      {/* Branding */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
          <CarFront size={20} />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight">TranspoGuide</h1>
          <p className="text-[10px] text-slate-400 uppercase">Operator Panel</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-4 space-y-1 mt-4">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 w-full p-3 rounded-lg transition-all duration-200 
                ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
            >
              <item.icon size={20} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-slate-800">
        <button className="flex items-center gap-3 text-slate-400 hover:text-red-400 transition w-full p-2 rounded-lg hover:bg-slate-800/50">
          <LogOut size={20} />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}
