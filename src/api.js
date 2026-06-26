// api.js — thin wrapper around fetch for talking to the backend.
// In production, set VITE_API_URL to your deployed backend's URL (e.g.
// https://riverside-booking-api.onrender.com). In development, leave it unset —
// Vite's dev server proxy (see vite.config.js) forwards /api requests to
// localhost:3001 automatically.

const API_BASE = import.meta.env.VITE_API_URL || "";

// By design, admin login is NEVER persisted across page loads — every visit to
// admin requires the password again, even on the same device/browser. This is
// intentional (matches a deliberate product requirement), not an oversight.
// These functions are deliberate no-ops kept only so App.jsx doesn't need to
// change its calls to them.
export function getStoredAdminToken() {
  return null;
}

export function storeAdminToken(_token) {
  // intentionally does nothing — see comment above
}

export function clearStoredAdminToken() {
  // intentionally does nothing — see comment above
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, token, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // some endpoints might return no body; that's fine for non-JSON-bearing responses
    }

    if (!res.ok) {
      throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
    }

    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      throw new ApiError("Request timed out. Please check your connection and try again.", 0);
    }
    if (e instanceof ApiError) throw e;
    throw new ApiError("Couldn't reach the server. Please check your connection and try again.", 0);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  getDay: (date) => request(`/api/day/${date}`),
  getToOptions: (date, fromMinute) => request(`/api/day/${date}/to-options?from=${fromMinute}`),
  getCalendarMonth: (year, month) => request(`/api/calendar/${year}/${month}`),
  getBranding: () => request("/api/branding"),
  createBooking: (payload) => request("/api/bookings", { method: "POST", body: payload }),

  adminLogin: (password) => request("/api/admin/login", { method: "POST", body: { password } }),
  adminSetWindow: (date, payload, token) =>
    request(`/api/admin/day/${date}/window`, { method: "PUT", body: payload, token }),
  adminDeleteBooking: (id, token) =>
    request(`/api/admin/bookings/${id}`, { method: "DELETE", token }),
  adminChangePassword: (newPassword, token) =>
    request("/api/admin/password", { method: "PUT", body: { newPassword }, token }),
  adminSetBranding: (name, logo, token) =>
    request("/api/admin/branding", { method: "PUT", body: { name, logo }, token }),
};

export { ApiError };
