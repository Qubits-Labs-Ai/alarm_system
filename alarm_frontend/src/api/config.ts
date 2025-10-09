// Centralized API configuration
// Reads base URL from env with robust handling (BOM + process.env fallback). No hardcoded defaults.
function resolveApiBaseUrl(): string | undefined {
  const metaEnv: any = (import.meta as any)?.env ?? {};
  // Some Windows editors save .env with a UTF-8 BOM, which prefixes the first key with \uFEFF
  const fromImportMeta = metaEnv.VITE_API_BASE_URL ?? metaEnv['\uFEFFVITE_API_BASE_URL'];
  // Fallback: defined in vite.config.ts via `define` so it's available at runtime
  const fromProcess = typeof process !== 'undefined' ? (process as any)?.env?.VITE_API_BASE_URL : undefined;
  return fromImportMeta ?? fromProcess ?? undefined;
}

export const API_BASE_URL: string | undefined = resolveApiBaseUrl();

if (!API_BASE_URL) {
  // Fail fast to surface misconfiguration during development/runtime
  throw new Error(
    'VITE_API_BASE_URL is not defined. Please set it in alarm_frontend/.env (e.g., VITE_API_BASE_URL=http://127.0.0.1:8000)'
  );
}
