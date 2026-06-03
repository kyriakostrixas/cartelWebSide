const reservationForm = document.querySelector("#reservation-form");
const reservationStatus = document.querySelector("#reservation-status");
const reservationMessage = document.querySelector("#reservation-message");
const reservationMessageTitle = document.querySelector("#reservation-message-title");
const reservationMessageText = document.querySelector("#reservation-message-text");
const reservationMessageOk = document.querySelector("#reservation-message-ok");
const reservationDate = document.querySelector('#reservation-form input[name="date"]');
const emailGate = document.querySelector("#email-gate");
const verificationEmail = document.querySelector("#verification-email");
const verificationCode = document.querySelector("#verification-code");
const verificationStatus = document.querySelector("#verification-status");
const verifyEmailButton = document.querySelector("#verify-email-button");
const continueReservationButton = document.querySelector("#continue-reservation-button");
const timeInput = document.querySelector('#reservation-form input[name="time"]');
const timeDropdown = document.querySelector("[data-time-dropdown]");
const timeTrigger = timeDropdown?.querySelector(".time-trigger");
const timeMenu = timeDropdown?.querySelector(".time-menu");
const timeOptions = timeDropdown ? [...timeDropdown.querySelectorAll(".time-option")] : [];
const cocktailCards = [...document.querySelectorAll("[data-cocktail-card]")];
const eventsList = document.querySelector("[data-events-list]");
const eventsSection = document.querySelector("#events");

if (reservationDate) {
  reservationDate.min = new Date().toISOString().slice(0, 10);
}

function setTimeMenuOpen(open) {
  if (!timeDropdown || !timeTrigger || !timeMenu) return;
  timeDropdown.classList.toggle("is-open", open);
  timeTrigger.setAttribute("aria-expanded", String(open));
  timeMenu.hidden = !open;
}

function resetTimeDropdown() {
  if (!timeInput || !timeTrigger) return;
  timeInput.value = "";
  timeTrigger.textContent = "Choose time";
  timeOptions.forEach((option) => {
    option.classList.remove("is-selected");
    option.setAttribute("aria-selected", "false");
  });
  setTimeMenuOpen(false);
}

if (timeDropdown && timeTrigger && timeInput) {
  timeTrigger.addEventListener("click", () => {
    setTimeMenuOpen(timeMenu?.hidden ?? true);
  });

  timeOptions.forEach((option) => {
    option.setAttribute("aria-selected", "false");
    option.addEventListener("click", () => {
      const value = option.dataset.timeValue || "";
      timeInput.value = value;
      timeTrigger.textContent = value;
      timeOptions.forEach((item) => {
        const isSelected = item === option;
        item.classList.toggle("is-selected", isSelected);
        item.setAttribute("aria-selected", String(isSelected));
      });
      setTimeMenuOpen(false);
      timeTrigger.focus();
    });
  });

  document.addEventListener("click", (event) => {
    if (!timeDropdown.contains(event.target)) {
      setTimeMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setTimeMenuOpen(false);
      timeTrigger.focus();
    }
  });
}

function setReservationStatus(message, type = "") {
  if (!reservationStatus) return;
  reservationStatus.textContent = message;
  reservationStatus.className = `form-status ${type}`.trim();
}

function setVerificationStatus(message, type = "") {
  if (!verificationStatus) return;
  verificationStatus.textContent = message;
  verificationStatus.className = `form-status ${type}`.trim();
}

function showReservationMessage({ title, message, type = "success" }) {
  if (!reservationMessage || !reservationMessageTitle || !reservationMessageText) {
    setReservationStatus(message, type);
    return;
  }

  reservationMessage.classList.toggle("error", type === "error");
  reservationMessageTitle.textContent = title;
  reservationMessageText.textContent = message;
  reservationMessage.hidden = false;
  reservationMessageOk?.focus();
}

function hideReservationMessage() {
  if (!reservationMessage) return;
  reservationMessage.hidden = true;
}

reservationMessageOk?.addEventListener("click", hideReservationMessage);
reservationMessage?.addEventListener("click", (event) => {
  if (event.target === reservationMessage) {
    hideReservationMessage();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && reservationMessage && !reservationMessage.hidden) {
    hideReservationMessage();
  }
});

async function loadCocktailCards() {
  if (!cocktailCards.length) return;

  try {
    const response = await fetch("/api/site/cocktails");
    const result = await response.json();
    if (!response.ok || !result.ok) return;

    cocktailCards.forEach((card, index) => {
      const item = result.cocktails?.[index];
      if (!item) return;

      const image = card.querySelector("[data-cocktail-image]");
      const eyebrow = card.querySelector("[data-cocktail-eyebrow]");
      const title = card.querySelector("[data-cocktail-title]");
      if (image && item.image) {
        image.src = item.image;
        image.alt = item.alt || item.title || "Cartel cocktail";
      }
      if (eyebrow) eyebrow.textContent = item.eyebrow || "";
      if (title) title.textContent = item.title || "";
    });
  } catch (error) {
    // Keep the default static cards if the server is unavailable.
  }
}

loadCocktailCards();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function eventTemplate(item) {
  return `
    <article class="event-row">
      <time><span>${escapeHtml(item.day)}</span>${escapeHtml(item.month)}</time>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.music)}</p>
      </div>
    </article>
  `;
}

function updateEventsDensity(count) {
  if (!eventsSection) return;
  eventsSection.style.setProperty("--event-count", String(count));
  const desktopBottom = count >= 5
    ? Math.max(16, 78 - count * 10)
    : Math.max(18, 56 - count * 7);
  const ctaGap = count >= 5
    ? Math.max(8, 36 - count * 4)
    : 14;
  const mobileBottom = count >= 5
    ? Math.max(14, 58 - count * 8)
    : Math.max(16, 44 - count * 6);
  const mobileCtaGap = count >= 5
    ? Math.max(8, 28 - count * 3)
    : 12;
  eventsSection.style.setProperty("--events-desktop-bottom", `${desktopBottom}px`);
  eventsSection.style.setProperty("--events-cta-gap", `${ctaGap}px`);
  eventsSection.style.setProperty("--events-mobile-bottom", `${mobileBottom}px`);
  eventsSection.style.setProperty("--events-mobile-cta-gap", `${mobileCtaGap}px`);
  eventsSection.classList.toggle("events-compact", count <= 4);
  eventsSection.classList.toggle("events-short", count <= 2);
  eventsSection.classList.toggle("events-long", count >= 5);
}

async function loadEvents() {
  if (!eventsList) return;
  updateEventsDensity(eventsList.querySelectorAll(".event-row").length);

  try {
    const response = await fetch("/api/site/events");
    const result = await response.json();
    if (!response.ok || !result.ok || !Array.isArray(result.events)) return;
    eventsList.innerHTML = result.events.map(eventTemplate).join("");
    updateEventsDensity(result.events.length);
  } catch (error) {
    // Keep the default static lineup if the server is unavailable.
  }
}

loadEvents();

function reservationPayload(form) {
  const data = new FormData(form);

  return {
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    email_code: String(data.get("email_code") || "").trim(),
    date: String(data.get("date") || "").trim(),
    time: String(data.get("time") || "").trim(),
    guests: Number(data.get("guests") || 0),
    notes: String(data.get("notes") || "").trim(),
  };
}

const commonEmailDomainFixes = {
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmail.con": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "live.con": "live.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "icloud.con": "icloud.com",
};

function obviousEmailTypo(email) {
  const domain = String(email || "").split("@").pop()?.toLowerCase();
  return commonEmailDomainFixes[domain] || "";
}

async function requestEmailVerificationCode() {
  if (!verificationEmail || !verifyEmailButton) return;
  const email = String(verificationEmail.value || "").trim();

  if (!verificationEmail.checkValidity()) {
    verificationEmail.reportValidity();
    return;
  }

  const suggestedDomain = obviousEmailTypo(email);
  if (suggestedDomain) {
    showReservationMessage({
      title: "Check your email",
      message: `Please check your email address. Did you mean ${suggestedDomain}?`,
      type: "error",
    });
    verificationEmail.focus();
    return;
  }

  verifyEmailButton.disabled = true;
  verifyEmailButton.textContent = "Sending...";
  setVerificationStatus("Sending your email verification code...");

  try {
    const response = await fetch("/api/email-verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not send the verification code.");
    }

    setVerificationStatus("Verification code sent. Please check your email.", "success");
    showReservationMessage({
      title: "Check your email",
      message: "We sent you a 6-digit code. Enter it here to unlock the reservation details.",
    });
    verificationCode?.focus();
  } catch (error) {
    showReservationMessage({
      title: "Check your email",
      message: error.message || "Could not send the verification code. Please try again.",
      type: "error",
    });
  } finally {
    verifyEmailButton.disabled = false;
    verifyEmailButton.textContent = "Send code";
  }
}

verifyEmailButton?.addEventListener("click", requestEmailVerificationCode);

async function continueToReservationDetails() {
  if (!reservationForm || !emailGate || !verificationEmail || !verificationCode || !continueReservationButton) return;
  const email = String(verificationEmail.value || "").trim();
  const code = String(verificationCode.value || "").trim();

  if (!verificationEmail.checkValidity()) {
    verificationEmail.reportValidity();
    return;
  }

  if (!code) {
    setVerificationStatus("Please enter the 6-digit code from your email.", "error");
    verificationCode.focus();
    return;
  }

  continueReservationButton.disabled = true;
  setVerificationStatus("Checking your code...");

  try {
    const response = await fetch("/api/email-verification/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, code }),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "The verification code is not correct.");
    }

    reservationForm.querySelector('[name="email"]').value = email;
    reservationForm.querySelector('[name="email_code"]').value = code;
    setVerificationStatus("", "");
    emailGate.hidden = true;
    reservationForm.hidden = false;
    reservationForm.querySelector('[name="name"]')?.focus();
  } catch (error) {
    const message = error.message || "The verification code is not correct.";
    setVerificationStatus(message, "error");
    showReservationMessage({
      title: "Check your code",
      message,
      type: "error",
    });
  } finally {
    continueReservationButton.disabled = false;
  }
}

continueReservationButton?.addEventListener("click", continueToReservationDetails);

verificationCode?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    continueToReservationDetails();
  }
});

if (reservationForm) {
  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = reservationForm.querySelector('button[type="submit"]');
    const payload = reservationPayload(reservationForm);

    if (!payload.time) {
      setReservationStatus("Please choose a reservation time.", "error");
      timeTrigger?.focus();
      return;
    }

    if (!reservationForm.checkValidity()) {
      reservationForm.reportValidity();
      return;
    }

    const suggestedDomain = obviousEmailTypo(payload.email);
    if (suggestedDomain) {
      showReservationMessage({
        title: "Check your email",
        message: `Please check your email address. Did you mean ${suggestedDomain}?`,
        type: "error",
      });
      reservationForm.querySelector('[name="email"]')?.focus();
      return;
    }

    setReservationStatus("Sending your reservation request...");
    submitButton.disabled = true;

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Reservation could not be saved.");
      }

      reservationForm.reset();
      resetTimeDropdown();
      reservationForm.querySelector('[name="guests"]').value = "2";
      reservationForm.querySelector('[name="email"]').value = "";
      reservationForm.querySelector('[name="email_code"]').value = "";
      if (emailGate) emailGate.hidden = false;
      reservationForm.hidden = true;
      if (verificationEmail) verificationEmail.value = "";
      if (verificationCode) verificationCode.value = "";
      setVerificationStatus("", "");
      setReservationStatus("", "");
      showReservationMessage({
        title: "Request received",
        message:
          "Your table request is now pending confirmation. Once Cartel confirms it, you will receive your confirmation email with all reservation details.",
        type: "success",
      });
    } catch (error) {
      const message =
        error.message && error.message !== "Failed to fetch"
          ? error.message
          : "This form needs the reservation server running. Please try again in a moment.";
      showReservationMessage({
        title: "Almost there",
        message,
        type: "error",
      });
    } finally {
      submitButton.disabled = false;
    }
  });
}
