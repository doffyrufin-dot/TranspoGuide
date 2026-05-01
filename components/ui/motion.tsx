'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils/cn';

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  style?: CSSProperties;
};

export function FadeIn({
  children,
  className,
  delay = 0,
  y = 16,
  duration = 0.45,
  style,
}: FadeInProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { threshold: 0.16 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : `translateY(${y}px)`,
        transitionProperty: 'opacity, transform',
        transitionDuration: `${duration}s`,
        transitionDelay: `${delay}s`,
        transitionTimingFunction: 'ease-out',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
};

type StaggerItemInternalProps = {
  staggerIndex?: number;
  staggerStep?: number;
  staggerDelayChildren?: number;
};

export function Stagger({
  children,
  className,
  stagger = 0.08,
  delayChildren = 0,
}: StaggerProps) {
  const mapped = Children.map(children, (child, index) => {
    if (!isValidElement(child)) return child;

    return cloneElement(child as ReactElement<StaggerItemInternalProps>, {
      staggerIndex: index,
      staggerStep: stagger,
      staggerDelayChildren: delayChildren,
    });
  });

  return <div className={cn(className)}>{mapped}</div>;
}

type StaggerItemProps = {
  children: ReactNode;
  className?: string;
  y?: number;
} & StaggerItemInternalProps;

export function StaggerItem({
  children,
  className,
  y = 16,
  staggerIndex = 0,
  staggerStep = 0.08,
  staggerDelayChildren = 0,
}: StaggerItemProps) {
  const delay = staggerDelayChildren + staggerIndex * staggerStep;
  return (
    <FadeIn className={cn(className)} y={y} delay={delay} duration={0.42}>
      {children}
    </FadeIn>
  );
}

