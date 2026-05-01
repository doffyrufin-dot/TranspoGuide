'use client';

import React from 'react';
import { FaBus, FaMotorcycle, FaShuttleVan, FaTaxi } from 'react-icons/fa';

export const iconForVehicle = (label: string) => {
  const key = (label || '').toLowerCase();
  if (key.includes('bus')) return <FaBus />;
  if (
    key.includes('van') ||
    key.includes('mini') ||
    key.includes('jeep') ||
    key.includes('multi')
  ) {
    return <FaShuttleVan />;
  }
  if (key.includes('trycicle') || key.includes('tricycle')) return <FaTaxi />;
  if (key.includes('habal')) return <FaMotorcycle />;
  return <FaShuttleVan />;
};

