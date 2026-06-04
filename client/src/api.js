const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const ADMIN_TOKEN_KEY = "cartel_admin_token";

function adminToken() {
  return window.sessionStorage?.getItem(ADMIN_TOKEN_KEY) || "";
}

function rememberAdminToken(token) {
  if (token) window.sessionStorage?.setItem(ADMIN_TOKEN_KEY, token);
}

function forgetAdminToken() {
  window.sessionStorage?.removeItem(ADMIN_TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = path.startsWith("/api/admin/") ? adminToken() : "";
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}`, "X-Admin-Token": token } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

export function getEvents() {
  return request("/api/site/events");
}

export function getCocktails() {
  return request("/api/site/cocktails");
}

export function getMenu() {
  return request("/api/site/menu");
}

export function sendEmailVerification(email) {
  return request("/api/email-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function checkEmailVerification(email, code) {
  return request("/api/email-verification/check", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function createReservation(reservation) {
  return request("/api/reservations", {
    method: "POST",
    body: JSON.stringify(reservation),
  });
}

export function adminSession() {
  return request("/api/admin/session").then((result) => {
    if (result.authenticated && result.token) rememberAdminToken(result.token);
    return result;
  });
}

export function adminLogin(password) {
  return request("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  }).then((result) => {
    rememberAdminToken(result.token);
    return result;
  });
}

export function adminLogout() {
  forgetAdminToken();
  return request("/api/admin/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getAdminReservations() {
  return request("/api/admin/reservations");
}

export function updateReservationStatus(id, status) {
  return request("/api/admin/reservations/status", {
    method: "POST",
    body: JSON.stringify({ id, status }),
  });
}

export function updateReservationArrival(id, arrived) {
  return request("/api/admin/reservations/arrival", {
    method: "POST",
    body: JSON.stringify({ id, arrived }),
  });
}

export function createManualReservation(reservation) {
  if (!adminToken()) {
    return adminSession().then(() => request("/api/admin/reservations/manual", {
      method: "POST",
      body: JSON.stringify(reservation),
    }));
  }
  return request("/api/admin/reservations/manual", {
    method: "POST",
    body: JSON.stringify(reservation),
  });
}

export function getAdminEvents() {
  return request("/api/admin/events");
}

export function getAdminCocktails() {
  return request("/api/admin/cocktails");
}

export function getAdminMenu() {
  return request("/api/admin/menu");
}

export function getAdminStatistics() {
  return request("/api/admin/statistics");
}

export function saveAdminEvents(events) {
  const payload = events.map(({ date, title, music }) => ({ date, title, music }));
  return request("/api/admin/events", {
    method: "POST",
    body: JSON.stringify({ events: payload }),
  });
}

export function saveAdminCocktails(formData) {
  return request("/api/admin/cocktails", {
    method: "POST",
    body: formData,
  });
}

export function uploadAdminMenu(file) {
  const formData = new FormData();
  formData.append("menu", file);
  return request("/api/admin/menu", {
    method: "POST",
    body: formData,
  });
}
