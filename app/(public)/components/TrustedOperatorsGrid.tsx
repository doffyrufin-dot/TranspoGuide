'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import TrustedOperatorCard, {
  type TrustedOperatorCardOperator,
} from '@/app/(public)/components/TrustedOperatorCard';

type TrustedOperatorsGridProps = {
  operators: TrustedOperatorCardOperator[];
};

const buildCardKey = (operator: TrustedOperatorCardOperator, index: number) =>
  `${operator.operator_user_id || operator.operator_email || 'operator'}-${index}`;

const wrapIndex = (index: number, total: number) => {
  if (total <= 0) return 0;
  return ((index % total) + total) % total;
};

const getCircularOffset = (index: number, activeIndex: number, total: number) => {
  if (total <= 1) return 0;
  let offset = index - activeIndex;
  const half = Math.floor(total / 2);
  if (offset > half) offset -= total;
  if (offset < -half) offset += total;
  return offset;
};

const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    'button, a, input, textarea, select, label, summary, [role="button"], [data-no-drag]'
  );
};

export default function TrustedOperatorsGrid({
  operators,
}: TrustedOperatorsGridProps) {
  const [openByKey, setOpenByKey] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  const rows = useMemo(
    () =>
      operators.map((operator, index) => ({
        operator,
        cardKey: buildCardKey(operator, index),
      })),
    [operators]
  );
  const totalSlides = rows.length;

  useEffect(() => {
    if (totalSlides === 0) return;
    setActiveIndex((prev) => wrapIndex(prev, totalSlides));
  }, [totalSlides]);

  const activeRow = rows[activeIndex] || null;

  const summary = useMemo(() => {
    if (totalSlides === 0) {
      return { averageRating: 0, totalReviews: 0 };
    }
    const totalRating = rows.reduce(
      (sum, row) => sum + Number(row.operator.average_rating || 0),
      0
    );
    const totalReviews = rows.reduce(
      (sum, row) => sum + Number(row.operator.review_count || 0),
      0
    );
    return {
      averageRating: totalRating / totalSlides,
      totalReviews,
    };
  }, [rows, totalSlides]);

  const goPrev = () => {
    if (totalSlides <= 1) return;
    setActiveIndex((prev) => wrapIndex(prev - 1, totalSlides));
  };

  const goNext = () => {
    if (totalSlides <= 1) return;
    setActiveIndex((prev) => wrapIndex(prev + 1, totalSlides));
  };

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    pointerId: number | null;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    pointerId: null,
    moved: false,
  });

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (totalSlides <= 1) return;
    if (isInteractiveTarget(event.target)) return;
    dragRef.current.active = true;
    dragRef.current.startX = event.clientX;
    dragRef.current.startY = event.clientY;
    dragRef.current.pointerId = event.pointerId;
    dragRef.current.moved = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
      dragRef.current.moved = true;
    }
    if (dragRef.current.moved) {
      event.preventDefault();
      window.getSelection?.()?.removeAllRanges();
    }
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50;

    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    dragRef.current.moved = false;

    if (isHorizontalSwipe) {
      if (deltaX < 0) {
        goNext();
      } else {
        goPrev();
      }
    }
  };

  const handleDragCancel = () => {
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    dragRef.current.moved = false;
  };

  const progress = totalSlides > 0 ? ((activeIndex + 1) / totalSlides) * 100 : 0;

  if (totalSlides === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-4 md:p-8 lg:p-10"
      style={{
        background:
          'radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--tg-glow) 30%, transparent) 0%, var(--tg-bg-alt) 56%, var(--tg-bg) 100%)',
        border: '1px solid var(--tg-border)',
      }}
    >
      <div
        className="pointer-events-none absolute -left-24 top-16 h-56 w-72 -rotate-[24deg]"
        style={{
          background:
            'linear-gradient(125deg, color-mix(in srgb, var(--tg-text) 10%, transparent), transparent)',
          clipPath: 'polygon(0 28%, 100% 0, 100% 65%, 0 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 top-10 h-64 w-80 rotate-[18deg]"
        style={{
          background:
            'linear-gradient(125deg, color-mix(in srgb, var(--tg-text) 10%, transparent), transparent)',
          clipPath: 'polygon(0 15%, 100% 0, 100% 78%, 0 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-9 h-44 w-3/4 -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background: 'color-mix(in srgb, var(--tg-text) 18%, transparent)',
          opacity: 0.18,
        }}
      />

      <div
        className="relative rounded-[24px] px-2 py-4 md:px-6 md:py-6 lg:px-8 lg:py-7"
        style={
          {
            background:
              'linear-gradient(160deg, rgba(2,6,23,0.96) 0%, rgba(2,6,23,0.92) 55%, rgba(10,15,34,0.95) 100%)',
            border: '1px solid rgba(148,163,184,0.28)',
            boxShadow:
              '0 35px 80px rgba(15,23,42,0.24), inset 0 1px 0 rgba(255,255,255,0.08)',
            '--tg-bg': '#020617',
            '--tg-bg-alt': '#0b132a',
            '--tg-card': '#0b1324',
            '--tg-card-hover': '#121b30',
            '--tg-text': '#e5e7eb',
            '--tg-muted': '#94a3b8',
            '--tg-border': 'rgba(148,163,184,0.22)',
            '--tg-border-primary': 'rgba(191,219,254,0.38)',
            '--tg-subtle': 'rgba(15,23,42,0.72)',
            '--tg-shadow': '0 16px 30px rgba(2,6,23,0.55)',
            '--tg-shadow-hover': '0 20px 34px rgba(2,6,23,0.65)',
            '--primary': '#93c5fd',
            '--primary-dark': '#60a5fa',
            '--primary-light': '#bfdbfe',
            '--tg-glow': 'rgba(148,197,255,0.35)',
          } as React.CSSProperties
        }
      >
        <div
          className="pointer-events-none absolute -left-6 right-6 bottom-2 h-28 rounded-[40%] blur-2xl"
          style={{ background: 'rgba(148,163,184,0.25)' }}
        />

        <div
          className="relative md:hidden cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragCancel}
          onDragStart={(event) => event.preventDefault()}
        >
          {activeRow && (
            <div className="mx-auto max-w-[390px]">
              <TrustedOperatorCard
                operator={activeRow.operator}
                isCommentsOpen={!!openByKey[activeRow.cardKey]}
                onToggleComments={() =>
                  setOpenByKey((prev) => ({
                    ...prev,
                    [activeRow.cardKey]: !prev[activeRow.cardKey],
                  }))
                }
              />
            </div>
          )}
        </div>

        <div
          className="relative hidden md:block min-h-[330px] lg:min-h-[360px] [perspective:1600px] cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragCancel}
          onDragStart={(event) => event.preventDefault()}
        >
          <div
            className="pointer-events-none absolute left-1/2 top-[46px] h-[300px] w-[96%] -translate-x-1/2 rounded-[30px]"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.20), rgba(255,255,255,0.04))',
              filter: 'blur(28px)',
              opacity: 0.12,
            }}
          />
          {rows.map(({ operator, cardKey }, index) => {
            const offset = getCircularOffset(index, activeIndex, totalSlides);
            const absOffset = Math.abs(offset);
            const isActive = offset === 0;
            const sideDirection = offset < 0 ? -1 : 1;

            if (absOffset > 1) {
              return null;
            }

            const sideTranslate = 235;
            const scale = isActive ? 1 : 0.86;
            const rotateY = isActive ? 0 : sideDirection * -26;
            const rotateZ = isActive ? 0 : sideDirection * -1.8;
            const topOffset = isActive ? 6 : 34;
            const horizontalShift = sideDirection * absOffset * sideTranslate;

            return (
              <div
                key={`desktop-${cardKey}`}
                className="absolute w-[min(80vw,420px)] transition-all duration-500 ease-out"
                style={{
                  top: `${topOffset}px`,
                  left: '50%',
                  marginLeft: `${horizontalShift}px`,
                  transform: `translateX(-50%) scale(${scale}) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
                  transformStyle: 'preserve-3d',
                  opacity: isActive ? 1 : 0.72,
                  zIndex: isActive ? 30 : 20,
                  filter: isActive ? 'none' : 'saturate(0.82)',
                }}
              >
                <TrustedOperatorCard
                  operator={operator}
                  isCommentsOpen={isActive && !!openByKey[cardKey]}
                  onToggleComments={() =>
                    setOpenByKey((prev) => ({
                      ...prev,
                      [cardKey]: !prev[cardKey],
                    }))
                  }
                />
                {!isActive && (
                  <button
                    type="button"
                    aria-label={`Show ${operator.operator_name}`}
                    onClick={() => setActiveIndex(index)}
                    className="absolute inset-0 cursor-pointer"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mt-5 md:mt-4 max-w-2xl mx-auto">
        <p className="text-center text-[11px] text-muted-theme font-semibold">
          {activeIndex + 1} of {totalSlides}
        </p>
        <div className="mt-2 flex items-center gap-4">
          <button
            type="button"
            onClick={goPrev}
            disabled={totalSlides <= 1}
            className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: '#0f172a',
              border: '1px solid rgba(148,163,184,0.3)',
              color: '#e2e8f0',
            }}
            aria-label="Previous operator"
          >
            <FaArrowLeft size={13} />
          </button>

          <div
            className="relative flex-1 h-[2px] rounded-full overflow-hidden"
            style={{ background: 'rgba(148,163,184,0.4)' }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: '#0f172a',
              }}
            />
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={totalSlides <= 1}
            className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: '#0f172a',
              border: '1px solid rgba(148,163,184,0.3)',
              color: '#e2e8f0',
            }}
            aria-label="Next operator"
          >
            <FaArrowRight size={13} />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 md:gap-3 max-w-2xl mx-auto">
        <div
          className="text-center rounded-xl px-2 py-3"
          style={{
            background: 'var(--tg-card)',
            border: '1px solid var(--tg-border)',
          }}
        >
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-theme">
            Operators
          </p>
          <p className="text-lg md:text-2xl font-extrabold text-theme mt-1">
            {totalSlides}+
          </p>
        </div>
        <div
          className="text-center rounded-xl px-2 py-3"
          style={{
            background: 'var(--tg-card)',
            border: '1px solid var(--tg-border)',
          }}
        >
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-theme">
            Avg Rating
          </p>
          <p className="text-lg md:text-2xl font-extrabold text-theme mt-1">
            {summary.averageRating.toFixed(1)}
          </p>
        </div>
        <div
          className="text-center rounded-xl px-2 py-3"
          style={{
            background: 'var(--tg-card)',
            border: '1px solid var(--tg-border)',
          }}
        >
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-theme">
            Reviews
          </p>
          <p className="text-lg md:text-2xl font-extrabold text-theme mt-1">
            {summary.totalReviews}+
          </p>
        </div>
      </div>
    </div>
  );
}
