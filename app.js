const reservationForm = document.querySelector("#reservation-form");
const reservationStatus = document.querySelector("#reservation-status");
const reservationMessage = document.querySelector("#reservation-message");
const reservationMessageTitle = document.querySelector("#reservation-message-title");
const reservationMessageText = document.querySelector("#reservation-message-text");
const reservationMessageOk = document.querySelector("#reservation-message-ok");
const reservationDate = document.querySelector('#reservation-form input[name="date"]');
const timeInput = document.querySelector('#reservation-form input[name="time"]');
const timeDropdown = document.querySelector("[data-time-dropdown]");
const timeTrigger = timeDropdown?.querySelector(".time-trigger");
const timeMenu = timeDropdown?.querySelector(".time-menu");
const timeOptions = timeDropdown ? [...timeDropdown.querySelectorAll(".time-option")] : [];
const cocktailCards = [...document.querySelectorAll("[data-cocktail-card]")];

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

function reservationPayload(form) {
  const data = new FormData(form);

  return {
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    date: String(data.get("date") || "").trim(),
    time: String(data.get("time") || "").trim(),
    guests: Number(data.get("guests") || 0),
    notes: String(data.get("notes") || "").trim(),
  };
}

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
