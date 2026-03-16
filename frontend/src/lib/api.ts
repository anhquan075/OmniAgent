export const getApiUrl = (path: string): string => {
  const base = import.meta.env.VITE_API_URL || '';
  
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${normalizedBase}${normalizedPath}`;
};
