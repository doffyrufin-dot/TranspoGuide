export const isAbortLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string };
  const name = (e.name || '').toLowerCase();
  const message = (e.message || '').toLowerCase();
  return name.includes('abort') || message.includes('aborted');
};
