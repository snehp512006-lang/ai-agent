const DEV_API_PROXY_PATH = '/api';

export const DEFAULT_API_TIMEOUT_MS = 180000;

export const normalizeApiBase = (url) => {
  const text = String(url || '').trim();
  if (!text) return null;
  if (/\/api\/?$/i.test(text)) return text.replace(/\/$/, '');
  return `${text.replace(/\/$/, '')}/api`;
};

export const resolveApiBaseUrl = () => {
  const envBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL;
  const normalized = normalizeApiBase(envBase);
  if (normalized) return normalized;

  // In development we rely on Vite proxy; in production we usually serve /api on same host.
  return DEV_API_PROXY_PATH;
};
