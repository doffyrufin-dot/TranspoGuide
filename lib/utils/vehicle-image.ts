const stripQueryHash = (value: string) => {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  const endCandidates = [queryIndex, hashIndex].filter((idx) => idx >= 0);
  if (endCandidates.length === 0) return value;
  const end = Math.min(...endCandidates);
  return value.slice(0, end);
};

const getVehicleUploadFilename = (value: string) => {
  const clean = stripQueryHash(value.replace(/\\/g, '/').trim());
  const parts = clean.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (!last) return '';
  if (!/^vehicle-[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(last)) {
    return '';
  }
  return last;
};

export const resolveVehicleImageUrl = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  if (/^data:/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/api/uploads/vehicles/')) return normalized;

  const filename = getVehicleUploadFilename(normalized);
  if (filename) {
    return `/api/uploads/vehicles/${encodeURIComponent(filename)}`;
  }

  if (normalized.startsWith('/')) return normalized;
  return `/${normalized.replace(/^\/+/, '')}`;
};

