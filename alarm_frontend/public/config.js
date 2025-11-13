// Runtime app configuration injected at page load.
// You can change this on the server without rebuilding the frontend.
// Example: set to your backend API base URL
// Note: Keep this file publicly readable; it is served as /config.js
window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__, {
  // Update this to your backend URL (http://host:port)
  API_BASE_URL: "http://localhost:8000",
});
