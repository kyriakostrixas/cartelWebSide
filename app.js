const reservationForm = document.querySelector("#reservation-form");
const reservationStatus = document.querySelector("#reservation-status");
const reservationDate = document.querySelector('#reservation-form input[name="date"]');

if (reservationDate) {
  reservationDate.min = new Date().toISOString().slice(0, 10);
}

function setReservationStatus(message, type = "") {
  if (!reservationStatus) return;
  reservationStatus.textContent = message;
  reservationStatus.className = `form-status ${type}`.trim();
}

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
      reservationForm.querySelector('[name="guests"]').value = "2";
      if (result.notification?.status === "sent") {
        setReservationStatus(
          "Reservation request received. Confirmation details have been sent by email.",
          "success",
        );
      } else {
        setReservationStatus(
          "Reservation request received and saved. Email confirmation was not sent.",
          "success",
        );
      }
    } catch (error) {
      setReservationStatus(
        "This form needs the reservation server running. Please try again in a moment.",
        "error",
      );
    } finally {
      submitButton.disabled = false;
    }
  });
}
