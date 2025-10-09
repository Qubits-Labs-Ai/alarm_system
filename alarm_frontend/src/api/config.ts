// Centralized API configuration
// Reads base URL strictly from Vite environment. No inline fallbacks.
export const API_BASE_URL: string | undefined = (import.meta as any)?.env?.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  // Fail fast to surface misconfiguration during development/runtime
  throw new Error(
    'VITE_API_BASE_URL is not defined. Please set it in alarm_frontend/.env (e.g., VITE_API_BASE_URL=https://your-backend)'
  );
}
