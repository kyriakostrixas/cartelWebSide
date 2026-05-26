if (window.location.protocol === "file:") {
  const serverUrl = new URL("http://127.0.0.1:4173/admin");
  serverUrl.search = window.location.search;
  serverUrl.hash = window.location.hash;
  window.location.replace(serverUrl.toString());
}

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const reservationsList = document.querySelector("#reservations-list");
const emptyState = document.querySelector("#empty-state");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#search-input");
const dateFilter = document.querySelector("#date-filter");
const statusFilter = document.querySelector("#status-filter");
const clearFilters = document.querySelector("#clear-filters");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");
const statisticsButton = document.querySelector("#statistics-button");
const reservationsButton = document.querySelector("#reservations-button");
const reservationsView = document.querySelector("#reservations-view");
const statisticsView = document.querySelector("#statistics-view");
const statisticsList = document.querySelector("#statistics-list");
const manualOpen = document.querySelector("#manual-open");
const manualModal = document.querySelector("#manual-modal");
const manualForm = document.querySelector("#manual-form");
const manualStatus = document.querySelector("#manual-status");
const adminMessageModal = document.querySelector("#admin-message-modal");
const adminMessagePanel = adminMessageModal?.querySelector(".admin-message-panel");
const adminMessageKicker = document.querySelector("#admin-message-kicker");
const adminMessageTitle = document.querySelector("#admin-message-title");
const adminMessageText = document.querySelector("#admin-message-text");
const adminMessageDetail = document.querySelector("#admin-message-detail");
const adminMessageConfirm = document.querySelector("#admin-message-confirm");
const adminMessageCancel = document.querySelector("#admin-message-cancel");
const manualCloseButtons = [
  document.querySelector("#manual-close"),
  document.querySelector("#manual-x"),
  document.querySelector("#manual-cancel"),
];

let reservations = [];
let statistics = null;
const ADMIN_TOKEN_KEY = "cartel_admin_token";
const failedEmailAlerts = new Set();

function showAdminMessage({
  kicker = "Reservation update",
  title,
  message,
  detail = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  showCancel = false,
  type = "success",
}) {
  return new Promise((resolve) => {
    if (
      !adminMessageModal ||
      !adminMessagePanel ||
      !adminMessageKicker ||
      !adminMessageTitle ||
      !adminMessageText ||
      !adminMessageDetail ||
      !adminMessageConfirm ||
      !adminMessageCancel
    ) {
      resolve("confirm");
      return;
    }

    adminMessagePanel.classList.toggle("error", type === "error");
    adminMessageKicker.textContent = kicker;
    adminMessageTitle.textContent = title;
    adminMessageText.textContent = message;
    adminMessageDetail.textContent = detail;
    adminMessageDetail.hidden = !detail;
    adminMessageConfirm.textContent = confirmLabel;
    adminMessageCancel.textContent = cancelLabel;
    adminMessageCancel.hidden = !showCancel;
    adminMessageModal.hidden = false;

    const finish = (action) => {
      adminMessageModal.hidden = true;
      adminMessageConfirm.removeEventListener("click", onConfirm);
      adminMessageCancel.removeEventListener("click", onCancel);
      resolve(action);
    };
    const onConfirm = () => finish("confirm");
    const onCancel = () => finish("cancel");

    adminMessageConfirm.addEventListener("click", onConfirm);
    adminMessageCancel.addEventListener("click", onCancel);
    adminMessageConfirm.focus();
  });
}

function adminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function adminHeaders(extra = {}) {
  return {
    ...extra,
    "X-Admin-Token": adminToken(),
  };
}

function showLogin(message = "") {
  loginView.hidden = false;
  dashboardView.hidden = true;
  closeManualForm();
  loginStatus.textContent = message;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function showReservationsView() {
  reservationsView.hidden = false;
  statisticsView.hidden = true;
  statisticsButton.hidden = false;
  reservationsButton.hidden = true;
}

function showStatisticsView() {
  reservationsView.hidden = true;
  statisticsView.hidden = false;
  statisticsButton.hidden = true;
  reservationsButton.hidden = false;
}

function openManualForm() {
  manualStatus.textContent = "";
  manualModal.hidden = false;
  manualForm.querySelector('input[name="name"]').focus();
}

function closeManualForm() {
  if (!manualModal) return;
  manualModal.hidden = true;
  manualStatus.textContent = "";
}

function manualPayload(form) {
  const data = new FormData(form);

  return {
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    date: String(data.get("date") || "").trim(),
    time: String(data.get("time") || "").trim(),
    guests: Number(data.get("guests") || 0),
    notes: String(data.get("notes") || "").trim(),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plural(value, singular, pluralLabel = `${singular}s`) {
  return Number(value) === 1 ? singular : pluralLabel;
}

function statusLabel(status) {
  return String(status || "pending").replace(/^\w/, (letter) => letter.toUpperCase());
}

function emailStatusLabel(status) {
  const labels = {
    not_configured: "not sent",
    not_sent: "not sent",
    sent: "sent / awaiting delivery",
    delivered: "delivered",
    failed: "failed / bounced",
  };

  return labels[status] || String(status || "not sent").replaceAll("_", " ");
}

function hasArrived(reservation) {
  return reservation.arrived === true || reservation.arrived === 1 || reservation.arrived === "1";
}

function reservationEmailLabel(reservation) {
  if (reservation.email) return reservation.email;
  return reservation.booking_source === "manual" ? "Admin manual entry" : "Missing";
}

function matchesFilters(reservation) {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const date = dateFilter.value;

  const haystack = [
    reservation.name,
    reservation.phone,
    reservation.email,
    reservation.notes,
  ]
    .join(" ")
    .toLowerCase();

  if (search && !haystack.includes(search)) return false;
  const arrived = hasArrived(reservation);
  if (status === "arrived" && !arrived) return false;
  if (status === "not_arrived" && arrived) return false;
  if (!["all", "arrived", "not_arrived"].includes(status) && reservation.status !== status) {
    return false;
  }
  if (date && reservation.reservation_date !== date) return false;

  return true;
}

function statsScope() {
  const date = dateFilter.value;
  if (!date) return reservations;
  return reservations.filter((item) => item.reservation_date === date);
}

function setStats() {
  const items = statsScope();
  const activeItems = items.filter((item) => item.status !== "cancelled");

  document.querySelector("#stat-total").textContent = items.length;
  document.querySelector("#stat-pending").textContent = items.filter(
    (item) => item.status === "pending",
  ).length;
  document.querySelector("#stat-confirmed").textContent = items.filter(
    (item) => item.status === "confirmed",
  ).length;
  document.querySelector("#stat-cancelled").textContent = items.filter(
    (item) => item.status === "cancelled",
  ).length;
  document.querySelector("#stat-guests").textContent = activeItems.reduce(
    (total, item) => total + Number(item.guests || 0),
    0,
  );
  document.querySelector("#stat-arrived-guests").textContent = activeItems
    .filter(hasArrived)
    .reduce((total, item) => total + Number(item.guests || 0), 0);
  document.querySelector("#stat-not-arrived-guests").textContent = activeItems
    .filter((item) => !hasArrived(item))
    .reduce((total, item) => total + Number(item.guests || 0), 0);
}

function renderStats() {
  setStats();
}

function reservationCard(reservation) {
  const notes = reservation.notes || "No notes added.";
  const emailStatus = emailStatusLabel(reservation.notification_status);
  const statuses = [
    ["confirmed", "Confirmed"],
    ["pending", "Pending"],
    ["cancelled", "Cancel"],
  ];
  const statusButtons = statuses
    .map(([status, label]) => {
      const isActive = reservation.status === status;
      const classes = isActive ? "status-action active" : "status-action ghost-button";
      const activeLabel = isActive ? ` aria-pressed="true"` : ` aria-pressed="false"`;
      return `<button type="button" data-status="${status}" class="${classes}"${activeLabel}>${label}</button>`;
    })
    .join("");
  const isCancelled = reservation.status === "cancelled";
  const arrivedClass = [
    "arrival-toggle",
    reservation.arrived ? "arrived" : "",
    isCancelled ? "locked" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const arrivedLabel = reservation.arrived ? "Arrived" : "Mark arrived";
  const arrivalDisabled = isCancelled ? " disabled aria-disabled=\"true\"" : "";

  return `
    <article class="reservation-card ${escapeHtml(reservation.status)}" data-id="${reservation.id}">
      <div class="reservation-date">
        <div>
          <strong>${escapeHtml(reservation.display_date)}</strong>
          <span>${escapeHtml(reservation.reservation_time)}</span>
        </div>
      </div>
      <div class="reservation-main">
        <h3>${escapeHtml(reservation.name)}</h3>
        <div class="reservation-meta">
          <div><span>Guests</span><strong>${escapeHtml(reservation.guests)}</strong></div>
          <div><span>Phone</span><strong>${escapeHtml(reservation.phone)}</strong></div>
          <div><span>Email</span><strong>${escapeHtml(reservationEmailLabel(reservation))}</strong></div>
          <div><span>Email status</span><strong>${escapeHtml(emailStatus)}</strong></div>
        </div>
        <p class="reservation-notes">${escapeHtml(notes)}</p>
      </div>
      <div class="reservation-actions">
        <span class="status-pill ${escapeHtml(reservation.status)}">${escapeHtml(statusLabel(reservation.status))}</span>
        <button
          type="button"
          class="${arrivedClass}"
          data-arrived="${reservation.arrived ? "false" : "true"}"
          aria-pressed="${reservation.arrived ? "true" : "false"}"
          ${arrivalDisabled}
        >
          <span>${reservation.arrived ? "✓" : ""}</span>
          ${arrivedLabel}
        </button>
        <div class="action-row">
          ${statusButtons}
        </div>
      </div>
    </article>
  `;
}

function customerLine(customer, rank, mode = "best") {
  if (!customer) return `<p class="empty-state compact">No data yet.</p>`;
  const numbers =
    mode === "worst"
      ? `
        <span>${escapeHtml(customer.cancelled)} ${plural(customer.cancelled, "cancel")}</span>
        <span>${escapeHtml(customer.cancelled_guests)} cancelled ${plural(customer.cancelled_guests, "guest")}</span>
      `
      : `
        <span>${escapeHtml(customer.reservations)} ${plural(customer.reservations, "booking")}</span>
        <span>${escapeHtml(customer.guests)} ${plural(customer.guests, "guest")}</span>
      `;

  return `
    <article class="customer-line">
      <span>${rank}</span>
      <div>
        <strong>${escapeHtml(customer.name || "Unknown customer")}</strong>
        <p>${escapeHtml(customer.phone || "No phone")}</p>
      </div>
      <div class="customer-numbers">
        ${numbers}
      </div>
    </article>
  `;
}

function customerList(customers, mode = "best") {
  if (!customers || customers.length === 0) {
    return `<p class="empty-state compact">No data yet.</p>`;
  }
  return customers.map((customer, index) => customerLine(customer, index + 1, mode)).join("");
}

function featuredCustomer(customer, emptyText = "No data yet.") {
  if (!customer) {
    return `<p class="empty-state compact">${emptyText}</p>`;
  }

  return `
    <div class="featured-stat">
      <strong>${escapeHtml(customer.name || "Unknown customer")}</strong>
      <span>${escapeHtml(customer.phone || "No phone")}</span>
      <p>${escapeHtml(customer.reservations)} ${plural(customer.reservations, "booking")} · ${escapeHtml(customer.guests)} ${plural(customer.guests, "guest")}</p>
    </div>
  `;
}

function featuredDate(dateStat) {
  if (!dateStat) {
    return `<p class="empty-state compact">No date data yet.</p>`;
  }

  return `
    <div class="featured-stat">
      <strong>${escapeHtml(dateStat.display_date)}</strong>
      <span>Most guests</span>
      <p>${escapeHtml(dateStat.guests)} guests</p>
    </div>
  `;
}

function statisticsSection(title, subtitle, stats) {
  return `
    <article class="statistics-card">
      <div class="statistics-card-heading">
        <div>
          ${subtitle ? `<p class="eyebrow">${escapeHtml(subtitle)}</p>` : ""}
          <h3>${escapeHtml(title)}</h3>
        </div>
      </div>
      <div class="statistics-grid">
        <section>
          <h4>Best customer</h4>
          ${featuredCustomer(stats.best_customer)}
        </section>
        <section>
          <h4>Date with most guests</h4>
          ${featuredDate(stats.most_guest_date)}
        </section>
        <section>
          <h4>Top five customers</h4>
          ${customerList(stats.top_customers)}
        </section>
      </div>
    </article>
  `;
}

function renderStatistics() {
  if (!statistics) {
    statisticsList.innerHTML = `<p class="empty-state">Statistics are not loaded yet.</p>`;
    return;
  }

  const allTime = statisticsSection("All time", "Ever", statistics.all_time);
  const seasons = (statistics.seasons || [])
    .map((season) =>
      statisticsSection(season.label, "", {
        best_customer: season.best_customer,
        top_customers: season.top_customers,
        most_guest_date: season.most_guest_date,
      }),
    )
    .join("");

  statisticsList.innerHTML = allTime + seasons;
}

function renderReservations() {
  const filtered = reservations.filter(matchesFilters);
  setStats();

  reservationsList.innerHTML = filtered.map(reservationCard).join("");
  emptyState.hidden = filtered.length > 0;
  resultCount.textContent =
    filtered.length === 1 ? "1 reservation shown" : `${filtered.length} reservations shown`;
}

function isEmailFailure(status) {
  return ["failed", "bounced", "blocked", "invalid"].includes(String(status || ""));
}

function notifyEmailDeliveryFailures(nextReservations) {
  const previousById = new Map(reservations.map((item) => [String(item.id), item]));
  nextReservations.forEach((reservation) => {
    const previous = previousById.get(String(reservation.id));
    const alertKey = `${reservation.id}:${reservation.notification_status}`;
    if (
      previous?.notification_status === "sent" &&
      isEmailFailure(reservation.notification_status) &&
      !failedEmailAlerts.has(alertKey)
    ) {
      failedEmailAlerts.add(alertKey);
      showAdminMessage({
        kicker: "Email delivery failed",
        title: "Confirm by phone",
        message:
          "Brevo reported that the confirmation email did not arrive. Please contact the customer by phone.",
        detail: `${reservation.name || "Customer"} · ${reservation.phone || "No phone"}`,
        type: "error",
      });
    }
    if (
      previous?.notification_status === "sent" &&
      reservation.notification_status === "delivered" &&
      reservation.status === "confirmed" &&
      !failedEmailAlerts.has(`delivered:${reservation.id}`)
    ) {
      failedEmailAlerts.add(`delivered:${reservation.id}`);
      showAdminMessage({
        kicker: "Email delivered",
        title: "Reservation confirmed",
        message:
          "Brevo confirmed the customer received the email. The reservation has now been confirmed automatically.",
        detail: `${reservation.name || "Customer"} · ${reservation.phone || "No phone"}`,
      });
    }
  });
}

function setReservations(nextReservations, { notifyFailures = false } = {}) {
  if (notifyFailures) {
    notifyEmailDeliveryFailures(nextReservations);
  }
  reservations = nextReservations;
}

async function loadReservations() {
  const response = await fetch("/api/admin/reservations", {
    headers: adminHeaders(),
  });

  if (response.status === 401) {
    showLogin("Please sign in again.");
    return;
  }

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Could not load reservations.");
  }

  setReservations(result.reservations || []);
  showDashboard();
  showReservationsView();
  renderReservations();
}

async function checkEmailDeliveryUpdates() {
  if (!adminToken() || dashboardView.hidden) return;

  const response = await fetch("/api/admin/reservations", {
    headers: adminHeaders(),
  });
  if (!response.ok) return;

  const result = await response.json();
  if (!result.ok) return;

  setReservations(result.reservations || [], { notifyFailures: true });
  renderReservations();
}

async function loadStatistics() {
  const response = await fetch("/api/admin/statistics", {
    headers: adminHeaders(),
  });

  if (response.status === 401) {
    showLogin("Please sign in again.");
    return;
  }

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Could not load statistics.");
  }

  statistics = result.statistics;
  renderStatistics();
  showStatisticsView();
}

async function updateStatus(id, status, options = {}) {
  const response = await fetch("/api/admin/reservations/status", {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id, status, force_confirm: Boolean(options.forceConfirm) }),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    const error = new Error(result.error || "Could not update reservation.");
    error.result = result;
    throw error;
  }

  const reservation = reservations.find((item) => String(item.id) === String(id));
  if (reservation) {
    if (result.reservation) {
      Object.assign(reservation, result.reservation);
    } else {
      reservation.status = status;
    }
    if (result.notification?.status) {
      reservation.notification_status = result.notification.status;
    }
  }
  renderReservations();
  return result;
}

async function updateArrival(id, arrived) {
  const reservation = reservations.find((item) => String(item.id) === String(id));
  const previousStatus = reservation?.status || "pending";

  const response = await fetch("/api/admin/reservations/arrival", {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id, arrived }),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Could not update arrival.");
  }

  if (reservation) {
    reservation.arrived = arrived;
    if (arrived) {
      reservation.arrival_previous_status = previousStatus;
      reservation.status = "confirmed";
    } else {
      reservation.status = reservation.arrival_previous_status || "pending";
      reservation.arrival_previous_status = null;
    }
  }
  renderReservations();
}

async function createManualReservation(payload) {
  const response = await fetch("/api/admin/reservations/manual", {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const result = await response.json();

  if (response.status === 401) {
    showLogin("Please sign in again.");
    return false;
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Could not save manual reservation.");
  }

  return true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "";

  const data = new FormData(loginForm);
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: data.get("password") }),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) {
    showLogin(result.error || "Could not sign in.");
    return;
  }

  sessionStorage.setItem(ADMIN_TOKEN_KEY, result.token);
  loginForm.reset();
  await loadReservations();
});

manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  manualStatus.textContent = "";

  if (!manualForm.checkValidity()) {
    manualForm.reportValidity();
    return;
  }

  const submitButton = manualForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  manualStatus.textContent = "Saving reservation...";

  try {
    const saved = await createManualReservation(manualPayload(manualForm));
    if (!saved) return;

    manualForm.reset();
    manualForm.querySelector('[name="guests"]').value = "2";
    closeManualForm();
    await loadReservations();
  } catch (error) {
    manualStatus.textContent = error.message || "Could not save manual reservation.";
  } finally {
    submitButton.disabled = false;
  }
});

manualOpen.addEventListener("click", openManualForm);
manualCloseButtons.forEach((button) => {
  button.addEventListener("click", closeManualForm);
});

reservationsList.addEventListener("click", async (event) => {
  const arrivalButton = event.target.closest("button[data-arrived]");
  if (arrivalButton) {
    if (arrivalButton.disabled || arrivalButton.getAttribute("aria-disabled") === "true") return;

    const card = arrivalButton.closest(".reservation-card");
    arrivalButton.disabled = true;
    try {
      await updateArrival(card.dataset.id, arrivalButton.dataset.arrived === "true");
    } finally {
      arrivalButton.disabled = false;
    }
    return;
  }

  const button = event.target.closest("button[data-status]");
  if (!button) return;

  const card = button.closest(".reservation-card");
  const reservation = reservations.find((item) => String(item.id) === String(card.dataset.id));
  button.disabled = true;

  try {
    const result = await updateStatus(card.dataset.id, button.dataset.status);
    if (button.dataset.status === "confirmed") {
      const emailWasSent = result.notification?.status === "sent";
      await showAdminMessage({
        title: emailWasSent ? "Email sent" : "Reservation confirmed",
        message: emailWasSent
          ? "Brevo accepted the confirmation email. The reservation will stay pending until Brevo reports that the email was delivered."
          : "The reservation is now confirmed successfully.",
      });
    }
  } catch (error) {
    const result = error.result || {};
    const failedReservation = result.reservation || reservation;
    if (button.dataset.status === "confirmed" && result.notification) {
      const action = await showAdminMessage({
        kicker: "Email not sent",
        title: "Confirm by phone?",
        message:
          "The confirmation email was not sent. Please continue the confirmation by phone, or cancel to keep the reservation in its previous status.",
        detail: failedReservation
          ? `${failedReservation.name || "Customer"} · ${failedReservation.phone || "No phone"}`
          : "",
        confirmLabel: "Continue to confirm",
        cancelLabel: "Cancel",
        showCancel: true,
        type: "error",
      });

      if (action === "confirm") {
        await updateStatus(card.dataset.id, "confirmed", { forceConfirm: true });
        await showAdminMessage({
          title: "Confirmed by phone",
          message: "The reservation is confirmed. Please contact the customer by phone using the details shown on the booking card.",
        });
      }
    } else {
      await showAdminMessage({
        title: "Update failed",
        message: error.message || "Could not update reservation.",
        type: "error",
      });
    }
  } finally {
    button.disabled = false;
  }
});

[searchInput, dateFilter, statusFilter].forEach((field) => {
  field.addEventListener("input", renderReservations);
});

clearFilters.addEventListener("click", () => {
  searchInput.value = "";
  dateFilter.value = "";
  statusFilter.value = "all";
  renderReservations();
});

setInterval(checkEmailDeliveryUpdates, 15000);

refreshButton.addEventListener("click", async () => {
  if (statisticsView.hidden) {
    await loadReservations();
  } else {
    await loadStatistics();
  }
});

statisticsButton.addEventListener("click", loadStatistics);
reservationsButton.addEventListener("click", () => {
  showReservationsView();
  renderReservations();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/logout", {
    method: "POST",
    headers: adminHeaders(),
  });
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  reservations = [];
  showLogin("");
});

async function boot() {
  const response = await fetch("/api/admin/session", {
    headers: adminHeaders(),
  });
  const result = await response.json();

  if (result.authenticated) {
    await loadReservations();
  } else {
    showLogin("");
  }
}

boot().catch(() => showLogin("Could not load admin dashboard."));
