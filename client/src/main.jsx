import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../styles.css";
import {
  adminLogin,
  adminLogout,
  adminSession,
  getAdminCocktails,
  getAdminEvents,
  getAdminReservations,
  getAdminStatistics,
  checkEmailVerification,
  createManualReservation,
  createReservation,
  getCocktails,
  getEvents,
  getMenu,
  sendEmailVerification,
  saveAdminCocktails,
  saveAdminEvents,
  updateReservationArrival,
  updateReservationStatus,
  uploadAdminMenu,
} from "./api";

const fallbackCocktails = [
  {
    image: "/cartel/ecobar.jpg",
    alt: "Cartel cocktail being poured at the bar",
    eyebrow: "Signature Pour",
    title: "Escobar serve",
  },
  {
    image: "/cartel/muchroom.jpeg",
    alt: "Cartel mushroom cocktail with rosemary garnish",
    eyebrow: "Forest Ritual",
    title: "Mushroom cocktail",
  },
  {
    image: "/cartel/doctor.jpg",
    alt: "Cartel doctor cocktail served with a drip presentation",
    eyebrow: "Doctor's Order",
    title: "Drip therapy serve",
  },
];

const fallbackEvents = [
  { day: "29", month: "May", title: "DJ MG", music: "Old School R&B Music" },
  { day: "30", month: "May", title: "DJ Rafaelos", music: "Mainstream Music" },
  { day: "31", month: "May", title: "DJ Chris NI", music: "Mainstream Music" },
];

const times = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"];
let eventDraftCounter = 0;
let cocktailDraftCounter = 0;

function publicAsset(path) {
  return String(path || "").replace(/^\/assets\/cartel\//, "/cartel/");
}

function eventEditorItem(item) {
  eventDraftCounter += 1;
  return {
    id: item.id || "",
    draftId: item.draftId || `event-draft-${eventDraftCounter}`,
    date: item.date || "",
    title: item.title || "",
    music: item.music || "",
  };
}

function cocktailEditorItem(item) {
  cocktailDraftCounter += 1;
  return {
    id: item.id || "",
    draftId: item.draftId || `cocktail-draft-${cocktailDraftCounter}`,
    image: publicAsset(item.image || ""),
    originalImage: item.image || "",
    alt: item.alt || "",
    eyebrow: item.eyebrow || "",
    title: item.title || "",
    file: null,
    preview: "",
  };
}

function useSiteContent() {
  const [cocktails, setCocktails] = useState(fallbackCocktails);
  const [events, setEvents] = useState(fallbackEvents);
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    getCocktails()
      .then((result) => setCocktails(result.cocktails?.length ? result.cocktails : fallbackCocktails))
      .catch(() => {});
    getEvents()
      .then((result) => setEvents(result.events?.length ? result.events : fallbackEvents))
      .catch(() => {});
    getMenu()
      .then((result) => setMenu(result.menu || null))
      .catch(() => {});
  }, []);

  return { cocktails, events, menu };
}

function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Cartel Cocktail Bar home">
        <img src="/cartel/logo.jpg" alt="" />
        <span>Cartel</span>
      </a>
      <nav aria-label="Main navigation">
        <a href="#cocktails">Menu</a>
        <a href="#events">Events</a>
        <a href="#visit">Visit</a>
      </nav>
      <a className="header-cta" href="#reservation">Reserve</a>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-media">
        <img src="/cartel/b1c3be80-f677-4642-bcc1-c10c0085cc0d.jpeg" alt="Cartel signature cocktail on the bar" />
      </div>
      <div className="hero-copy">
        <p className="eyebrow">Cocktail Bar · Protaras</p>
        <h1 id="hero-title">An elevated night on the strip.</h1>
        <p>
          Signature serves, polished hospitality, and a late-night atmosphere designed
          for golden-hour arrivals, after-dinner drinks, and long summer evenings.
        </p>
        <div className="hero-actions" aria-label="Primary actions">
          <a className="button primary" href="#visit">Plan Your Visit</a>
          <a className="button ghost" href="#menu-viewer">Explore Cocktails</a>
        </div>
      </div>
      <aside className="hero-note" aria-label="Tonight at Cartel">
        <span>Evening Service</span>
        <strong>Signature cocktails from 18:00</strong>
        <p>Ask at the bar for seasonal Cartel recommendations.</p>
      </aside>
    </section>
  );
}

function Mood() {
  return (
    <section className="intro-section">
      <div className="mood-copy">
        <p className="eyebrow">The mood</p>
        <h2>Low light, precise serves, effortless rhythm.</h2>
        <p>
          Cartel brings a more refined cocktail ritual to the Protaras strip:
          photogenic drinks, attentive service, and a room that feels composed without
          losing its late-night pulse.
        </p>
      </div>
      <figure className="mood-image">
        <img src="/cartel/mood.jpg" alt="Cartel Cocktail Bar interior with blue bar stools and warm pendant lighting" />
      </figure>
      <div className="mood-details" aria-label="Cartel atmosphere highlights">
        <span>Warm pendant light</span>
        <span>Premium back bar</span>
        <span>Blue velvet seating</span>
      </div>
    </section>
  );
}

function Cocktails({ cocktails }) {
  return (
    <section className="drink-grid" id="cocktails" aria-labelledby="cocktails-title">
      <div className="section-heading">
        <p className="eyebrow">Cocktails</p>
        <h2 id="cocktails-title">Signature drinks with presence.</h2>
        <p>Explore our menu to discover more about our signature cocktails.</p>
        <a className="menu-panel-link" href="#menu-viewer">Explore Cocktails</a>
      </div>
      {cocktails.map((item, index) => (
        <article className={`drink-card ${index === 0 ? "large" : ""}`} key={`${item.title}-${index}`}>
          <img src={publicAsset(item.image)} alt={item.alt || item.title} />
          <div>
            <span>{item.eyebrow}</span>
            <h3>{item.title}</h3>
          </div>
        </article>
      ))}
    </section>
  );
}

function MenuViewer({ menu }) {
  const isPdf = menu?.type === "pdf" || /\.pdf($|\?)/i.test(menu?.url || "");

  return (
    <section className="menu-viewer" id="menu-viewer" aria-labelledby="menu-viewer-title">
      <a className="menu-viewer-backdrop" href="#top" aria-label="Close cocktail menu"></a>
      <div className="menu-viewer-panel" role="dialog" aria-modal="true" aria-labelledby="menu-viewer-title">
        <div className="menu-viewer-header">
          <div>
            <p className="eyebrow">Cartel Menu</p>
            <h2 id="menu-viewer-title">Cocktails & signatures</h2>
          </div>
          <a className="menu-close" href="#top" aria-label="Close cocktail menu">Close</a>
        </div>
        <div className="menu-preview">
          {menu?.url ? (
            isPdf ? (
              <>
                <img src="/cartel/menu-page-1.png?v=full-menu" alt="Cartel Cocktail Bar cocktails menu" />
                <img src="/cartel/menu-page-2.png?v=full-menu" alt="Cartel Cocktail Bar spirits and drinks menu" />
              </>
            ) : (
              <img src={menu.url} alt="Cartel Cocktail Bar menu" />
            )
          ) : (
            <>
              <img src="/cartel/menu-page-1.png?v=full-menu" alt="Cartel Cocktail Bar cocktails menu" />
              <img src="/cartel/menu-page-2.png?v=full-menu" alt="Cartel Cocktail Bar spirits and drinks menu" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Events({ events }) {
  const count = events.length;
  const densityStyle = useMemo(() => {
    const desktopBottom = count >= 5 ? Math.max(16, 78 - count * 10) : Math.max(18, 56 - count * 7);
    const ctaGap = count >= 5 ? Math.max(8, 36 - count * 4) : 14;
    const mobileBottom = count >= 5 ? Math.max(14, 58 - count * 8) : Math.max(16, 44 - count * 6);
    const mobileCtaGap = count >= 5 ? Math.max(8, 28 - count * 3) : 12;
    return {
      "--event-count": count,
      "--events-desktop-bottom": `${desktopBottom}px`,
      "--events-cta-gap": `${ctaGap}px`,
      "--events-mobile-bottom": `${mobileBottom}px`,
      "--events-mobile-cta-gap": `${mobileCtaGap}px`,
    };
  }, [count]);
  const densityClass = [
    "events-section",
    count <= 4 ? "events-compact" : "",
    count <= 2 ? "events-short" : "",
    count >= 5 ? "events-long" : "",
  ].filter(Boolean).join(" ");

  return (
    <section className={densityClass} id="events" aria-labelledby="events-title" style={densityStyle}>
      <div className="events-intro">
        <p className="eyebrow">Line Up</p>
        <h2 id="events-title">The nights everyone talks about.</h2>
        <p>
          Reserve your table for DJ-led evenings on the Protaras strip, from mainstream
          sets to old school R&B nights.
        </p>
      </div>
      <div className="events-list" aria-label="Cartel event lineup">
        {events.map((item, index) => (
          <article className="event-row" key={`${item.date || item.day}-${item.title}-${index}`}>
            <time><span>{item.day}</span>{item.month}</time>
            <div>
              <h3>{item.title}</h3>
              <p>{item.music}</p>
            </div>
          </article>
        ))}
      </div>
      <a className="events-cta" href="#reservation">Reserve your table online</a>
    </section>
  );
}

function Visit() {
  return (
    <section className="visit" id="visit" aria-labelledby="visit-title">
      <div>
        <p className="eyebrow">Find us</p>
        <h2 id="visit-title">Find us in the heart of Protaras.</h2>
      </div>
      <div className="visit-panel">
        <div>
          <span>Location</span>
          <strong>Protaras, Cyprus</strong>
          <p>Ideal for pre-dinner cocktails, intimate celebrations, and late holiday nights.</p>
        </div>
        <div className="visit-actions">
          <a className="button primary" href="https://maps.google.com/?q=Cartel%20Cocktail%20Bar%20Protaras">Open Maps</a>
          <a className="button ghost" href="https://www.instagram.com/cartelcocktailbar/">Instagram</a>
        </div>
      </div>
    </section>
  );
}

function Reservation() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    date: "",
    time: "",
    guests: 2,
    notes: "",
  });

  useEffect(() => {
    if (!timeOpen) return undefined;
    function closeTimeMenu(event) {
      if (!event.target.closest?.("[data-time-dropdown]")) setTimeOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setTimeOpen(false);
    }
    document.addEventListener("click", closeTimeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeTimeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [timeOpen]);

  async function sendCode() {
    setStatus("Sending your email verification code...");
    try {
      await sendEmailVerification(email);
      setStatus("Verification code sent. Please check your email.");
    } catch (error) {
      const text = error.message || "We could not send the verification code. Please check your email and try again.";
      setStatus(text);
      setMessage({
        title: "Check your email",
        text,
        type: "error",
      });
    }
  }

  async function verifyCode() {
    try {
      await checkEmailVerification(email, code);
      setVerified(true);
      setStatus("Email verified. You can now enter your reservation details.");
    } catch (error) {
      const text = error.message || "The verification code is not correct or has expired.";
      setStatus(text);
      setMessage({
        title: "Check your code",
        text,
        type: "error",
      });
    }
  }

  async function submitReservation(event) {
    event.preventDefault();
    setStatus("Sending your reservation request...");
    try {
      await createReservation({ ...form, email, email_code: code });
      setStatus("");
      setVerified(false);
      setTimeOpen(false);
      setEmail("");
      setCode("");
      setForm({ name: "", phone: "", date: "", time: "", guests: 2, notes: "" });
      setMessage({
        title: "Request received",
        text: "Your table request is now pending confirmation. Once Cartel confirms it, you will receive your confirmation email with all reservation details.",
        type: "success",
      });
    } catch (error) {
      const text = error.message || "Reservation could not be saved. Please try again in a moment.";
      setStatus(text);
      setMessage({
        title: "Almost there",
        text,
        type: "error",
      });
    }
  }

  return (
    <section className="reservation-viewer" id="reservation" aria-labelledby="reservation-title">
      <a className="reservation-backdrop" href="#top" aria-label="Close reservation form"></a>
      <div className="reservation-panel" role="dialog" aria-modal="true" aria-labelledby="reservation-title">
        <a className="reservation-close" href="#top" aria-label="Close reservation form">×</a>
        <div className="reservation-copy">
          <p className="eyebrow">Reservations</p>
          <h2 id="reservation-title">Reserve your table.</h2>
          <p>Send your preferred date, time, and party size. Cartel will contact you to confirm your table before arrival.</p>
          <div className="reservation-notes" aria-label="Reservation notes">
            <span>Evening service from 18:00</span>
            <span>DJ nights fill quickly</span>
            <span>Confirmation by email</span>
          </div>
        </div>

        {!verified ? (
          <section className="email-gate" aria-labelledby="email-gate-title">
            <p className="eyebrow">Email verification</p>
            <h3 id="email-gate-title">Verify your email first.</h3>
            <p>We will send a private 6-digit code so your confirmation can reach you.</p>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <div className="email-verification">
              <label>
                Verification code
                <input type="text" inputMode="numeric" maxLength="6" value={code} onChange={(event) => setCode(event.target.value)} />
              </label>
              <button className="verify-email-button" type="button" onClick={sendCode}>Send code</button>
            </div>
            <button className="button primary" type="button" onClick={verifyCode}>Continue to reservation</button>
            <p className="form-status" role="status" aria-live="polite">{status}</p>
          </section>
        ) : (
          <form className="reservation-form" onSubmit={submitReservation}>
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Phone
              <input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
            </label>
            <div className="form-row">
              <label>
                Date
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
              </label>
              <label>
                Time
                <input type="hidden" value={form.time} required readOnly />
                <div className={`time-dropdown ${timeOpen ? "is-open" : ""}`} data-time-dropdown>
                  <button
                    className="time-trigger"
                    type="button"
                    aria-expanded={timeOpen ? "true" : "false"}
                    aria-haspopup="listbox"
                    onClick={() => setTimeOpen((open) => !open)}
                  >
                    {form.time || "Choose time"}
                  </button>
                  <div className="time-menu" role="listbox" hidden={!timeOpen}>
                    {times.map((time) => (
                      <button
                        key={time}
                        className={`time-option ${form.time === time ? "is-selected" : ""}`}
                        type="button"
                        role="option"
                        aria-selected={form.time === time ? "true" : "false"}
                        data-time-value={time}
                        onClick={() => {
                          setForm({ ...form, time });
                          setTimeOpen(false);
                        }}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </label>
            </div>
            <label>
              Guests
              <input type="number" min="1" value={form.guests} onChange={(event) => setForm({ ...form, guests: event.target.value })} required />
            </label>
            <label>
              Notes
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            <button className="button primary" type="submit">Request Reservation</button>
            <p className="form-status" role="status" aria-live="polite">{status}</p>
          </form>
        )}
      </div>
      {message ? (
        <ReservationMessage
          {...message}
          onClose={() => setMessage(null)}
        />
      ) : null}
    </section>
  );
}

function ReservationMessage({ title, text, type = "success", onClose }) {
  return (
    <div className={`reservation-message ${type === "error" ? "error" : ""}`} role="dialog" aria-modal="true" aria-labelledby="reservation-message-title">
      <div className="reservation-message-card">
        <p className="reservation-message-kicker">Cartel Reservations</p>
        <h3 id="reservation-message-title">{title}</h3>
        <p>{text}</p>
        <button className="button primary" type="button" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

function App() {
  const { cocktails, events, menu } = useSiteContent();
  const isAdmin = window.location.pathname === "/admin";

  if (isAdmin) {
    return <AdminApp />;
  }

  return (
    <>
      <Header />
      <main id="top">
        <Hero />
        <section className="ticker" aria-label="Cartel highlights">
          <span>Signature serves</span>
          <span>Late service</span>
          <span>Premium bottles</span>
          <span>Central Protaras</span>
        </section>
        <Mood />
        <Cocktails cocktails={cocktails} />
        <Events events={events} />
        <Visit />
      </main>
      <MenuViewer menu={menu} />
      <Reservation />
    </>
  );
}

function statusLabel(status) {
  if (status === "confirmed") return "Confirmed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function emailStatusLabel(status) {
  if (status === "sent") return "sent";
  if (status === "delivered") return "delivered";
  return "not sent";
}

function hasArrived(reservation) {
  return reservation.arrived === true || reservation.arrived === 1 || reservation.arrived === "1";
}

function reservationEmailLabel(reservation) {
  if (reservation.email) return reservation.email;
  return reservation.booking_source === "manual" ? "Admin manual entry" : "Missing";
}

function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [reservations, setReservations] = useState([]);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStatus, setManualStatus] = useState("");
  const [view, setView] = useState("reservations");
  const [events, setEvents] = useState([]);
  const [eventStatus, setEventStatus] = useState("");
  const [cocktails, setCocktails] = useState([]);
  const [cocktailStatus, setCocktailStatus] = useState("");
  const [statistics, setStatistics] = useState(null);
  const [statisticsStatus, setStatisticsStatus] = useState("");
  const [adminMessage, setAdminMessage] = useState(null);

  useEffect(() => {
    import("../../admin.css");
    adminSession()
      .then((result) => {
        setAuthenticated(Boolean(result.authenticated));
        if (result.authenticated) loadReservations();
      })
      .catch(() => setAuthenticated(false));
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginStatus("");
    try {
      await adminLogin(password);
      setAuthenticated(true);
      setPassword("");
      await loadReservations();
    } catch (error) {
      setLoginStatus(error.message || "Could not sign in.");
    }
  }

  async function handleLogout() {
    await adminLogout().catch(() => {});
    setAuthenticated(false);
    setReservations([]);
  }

  async function loadReservations() {
    setLoading(true);
    try {
      const result = await getAdminReservations();
      setReservations(result.reservations || []);
    } catch (error) {
      setMessage(error.message || "Could not load reservations.");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(reservation, nextStatus) {
    setMessage("");
    try {
      const result = await updateReservationStatus(reservation.id, nextStatus);
      if (result.reservation) {
        setReservations((items) => items.map((item) => item.id === reservation.id ? result.reservation : item));
      } else {
        await loadReservations();
      }
      if (nextStatus === "confirmed") {
        setAdminMessage({
          kicker: "Reservation update",
          title: "Reservation confirmed",
          message: result.notification?.status === "sent"
            ? "The confirmation email was sent and the reservation is confirmed."
            : "The reservation is confirmed.",
          type: "success",
        });
      } else if (nextStatus === "pending") {
        setAdminMessage({
          kicker: "Reservation update",
          title: "Reservation pending",
          message: "The reservation has been moved back to pending.",
          type: "success",
        });
      } else if (nextStatus === "cancelled") {
        setAdminMessage({
          kicker: "Reservation update",
          title: "Reservation cancelled",
          message: "The reservation has been marked as cancelled.",
          type: "success",
        });
      }
    } catch (error) {
      setAdminMessage({
        kicker: "Reservation update",
        title: "Update failed",
        message: error.message || "Could not update reservation.",
        type: "error",
      });
    }
  }

  async function toggleArrived(reservation) {
    if (reservation.status === "cancelled") return;
    const nextArrived = !hasArrived(reservation);
    setMessage("");
    try {
      await updateReservationArrival(reservation.id, nextArrived);
      await loadReservations();
      setAdminMessage({
        kicker: "Arrival update",
        title: nextArrived ? "Guest marked arrived" : "Arrival removed",
        message: nextArrived
          ? "The reservation has been marked as arrived and confirmed."
          : "The arrival mark has been removed and the previous reservation status has been restored.",
        type: "success",
      });
    } catch (error) {
      setAdminMessage({
        kicker: "Arrival update",
        title: "Update failed",
        message: error.message || "Could not update arrival.",
        type: "error",
      });
    }
  }

  async function saveManualReservation(payload) {
    setManualStatus("Saving reservation...");
    try {
      await createManualReservation(payload);
      setManualStatus("");
      setManualOpen(false);
      setAdminMessage({
        kicker: "Admin entry",
        title: "Reservation saved",
        message: "Manual reservation saved and confirmed.",
        type: "success",
      });
      await loadReservations();
    } catch (error) {
      setManualStatus(error.message || "Could not save manual reservation.");
    }
  }

  async function loadEventsEditor() {
    setView("events");
    setEventStatus("");
    try {
      const result = await getAdminEvents();
      setEvents((result.events || []).map(eventEditorItem));
    } catch (error) {
      setEventStatus(error.message || "Could not load events.");
    }
  }

  async function loadCocktailEditor() {
    setView("cocktails");
    setCocktailStatus("");
    try {
      const result = await getAdminCocktails();
      setCocktails((result.cocktails || []).map(cocktailEditorItem));
    } catch (error) {
      setCocktailStatus(error.message || "Could not load cocktail cards.");
    }
  }

  function updateCocktail(index, field, value) {
    setCocktails((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  }

  function updateCocktailImage(index, file) {
    setCocktails((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (item.preview) URL.revokeObjectURL(item.preview);
      return { ...item, file, preview: file ? URL.createObjectURL(file) : "" };
    }));
  }

  async function saveCocktails(submitEvent) {
    submitEvent.preventDefault();
    setCocktailStatus("Saving cocktail cards...");
    try {
      const formData = new FormData();
      formData.append("card_count", String(cocktails.length));
      cocktails.forEach((item, index) => {
        formData.append(`id_${index}`, item.id || "");
        formData.append(`existing_image_${index}`, item.originalImage || item.image || "");
        formData.append(`alt_${index}`, item.alt || "");
        formData.append(`eyebrow_${index}`, item.eyebrow || "");
        formData.append(`title_${index}`, item.title || "");
        if (item.file) formData.append(`image_${index}`, item.file);
      });
      const result = await saveAdminCocktails(formData);
      setCocktails((result.cocktails || []).map(cocktailEditorItem));
      setCocktailStatus("");
      setAdminMessage({
        kicker: "Cocktail cards",
        title: "Saved",
        message: "The website cocktail section has been updated.",
        type: "success",
      });
    } catch (error) {
      setCocktailStatus(error.message || "Could not save cocktail cards.");
    }
  }

  async function uploadMenu(file) {
    if (!file) return;
    setCocktailStatus("Uploading menu...");
    try {
      await uploadAdminMenu(file);
      setCocktailStatus("");
      setAdminMessage({
        kicker: "Cartel menu",
        title: "Menu uploaded",
        message: "The website menu viewer has been updated.",
        type: "success",
      });
    } catch (error) {
      setCocktailStatus(error.message || "Could not upload menu.");
    }
  }

  async function loadStatistics() {
    setView("statistics");
    setStatisticsStatus("Loading statistics...");
    try {
      const result = await getAdminStatistics();
      setStatistics(result.statistics || null);
      setStatisticsStatus("");
    } catch (error) {
      setStatisticsStatus(error.message || "Could not load statistics.");
    }
  }

  function updateEvent(index, field, value) {
    setEvents((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  }

  function addEvent() {
    setEvents((items) => [...items, eventEditorItem({})]);
  }

  function deleteEvent(index) {
    setEvents((items) => items.filter((item, itemIndex) => itemIndex !== index));
  }

  async function saveEvents(submitEvent) {
    submitEvent.preventDefault();
    setEventStatus("Saving events...");
    try {
      const result = await saveAdminEvents(events);
      setEvents((result.events || []).map(eventEditorItem));
      setEventStatus("Events saved. The website events section has been updated.");
      setAdminMessage({
        kicker: "Website update",
        title: "Events saved",
        message: "The website events section has been updated.",
        type: "success",
      });
    } catch (error) {
      setEventStatus(error.message || "Could not save events.");
    }
  }

  const visibleReservations = reservations.filter((reservation) => {
    const haystack = [
      reservation.name,
      reservation.phone,
      reservation.email,
      reservation.notes,
      reservation.status,
    ].join(" ").toLowerCase();
    const arrived = hasArrived(reservation);
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (date && reservation.reservation_date !== date) return false;
    if (status === "arrived" && !arrived) return false;
    if (status === "not_arrived" && arrived) return false;
    if (!["all", "arrived", "not_arrived"].includes(status) && reservation.status !== status) return false;
    return true;
  });

  const statsSource = date
    ? reservations.filter((item) => item.reservation_date === date)
    : reservations;
  const stats = statsSource.reduce((acc, item) => {
    const guests = Number(item.guests || 0);
    const arrived = hasArrived(item);
    acc.total += 1;
    if (item.status === "pending") acc.pending += 1;
    if (item.status === "confirmed") acc.confirmed += 1;
    if (item.status === "cancelled") acc.cancelled += 1;
    if (item.status !== "cancelled") acc.guests += guests;
    if (arrived && item.status !== "cancelled") acc.arrivedGuests += guests;
    if (!arrived && item.status !== "cancelled") acc.notArrivedGuests += guests;
    return acc;
  }, {
    total: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    guests: 0,
    arrivedGuests: 0,
    notArrivedGuests: 0,
  });

  if (!authenticated) {
    return (
      <main className="admin-shell">
        <section className="login-view">
          <div className="login-panel">
            <p className="eyebrow">Cartel Admin</p>
            <h1>Reservations</h1>
            <p>Sign in to review bookings, confirm tables, and keep the night organised.</p>
            <form className="login-form" onSubmit={handleLogin}>
              <label>
                Admin password
                <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <button type="submit">Sign In</button>
              <p className="status-message" role="status" aria-live="polite">{loginStatus}</p>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <section className="dashboard-view">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Cartel Admin</p>
            <h1>Reservations</h1>
          </div>
          <div className="header-actions">
            <a href="/" className="ghost-button" onClick={(event) => {
              event.preventDefault();
              window.location.assign("/");
            }}>Website</a>
            {view === "statistics" ? (
              <button type="button" className="ghost-button" onClick={() => setView("reservations")}>Reservations</button>
            ) : (
              <button type="button" className="ghost-button" onClick={loadStatistics}>Statistics</button>
            )}
            {view === "cocktails" ? (
              <button type="button" className="ghost-button" onClick={() => setView("reservations")}>Reservations</button>
            ) : (
              <button type="button" className="ghost-button" onClick={loadCocktailEditor}>Edit cocktails section</button>
            )}
            {view === "events" ? (
              <button type="button" className="ghost-button" onClick={() => setView("reservations")}>Reservations</button>
            ) : (
              <button type="button" className="ghost-button" onClick={loadEventsEditor}>Edit events section</button>
            )}
            {view === "reservations" ? <button type="button" className="ghost-button" onClick={() => setManualOpen(true)}>Add Reservation</button> : null}
            {view === "reservations" ? <button type="button" onClick={loadReservations}>{loading ? "Refreshing" : "Refresh"}</button> : null}
            <button type="button" className="ghost-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {view === "reservations" ? (
          <>
            <section className="stats-grid" aria-label="Reservation overview">
              <article><span>Total</span><strong>{stats.total}</strong></article>
              <article><span>Pending</span><strong>{stats.pending}</strong></article>
              <article><span>Confirmed</span><strong>{stats.confirmed}</strong></article>
              <article><span>Cancels</span><strong>{stats.cancelled}</strong></article>
              <article><span>Guests</span><strong>{stats.guests}</strong></article>
              <article><span>Arrived Guests</span><strong>{stats.arrivedGuests}</strong></article>
              <article><span>Not Arrived Guests</span><strong>{stats.notArrivedGuests}</strong></article>
            </section>

            <section className="toolbar" aria-label="Reservation filters">
              <label>
                Search
                <input type="search" placeholder="Name, phone, or email" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <label>
                Date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label>
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="arrived">Arrived</option>
                  <option value="not_arrived">Not Arrived</option>
                </select>
              </label>
              <button type="button" className="ghost-button" onClick={() => { setSearch(""); setDate(""); setStatus("all"); }}>Clear</button>
            </section>

            {message ? <p className="status-message" role="status">{message}</p> : null}

            <section className="reservations-panel">
              <div className="panel-heading">
                <h2>Booking List</h2>
                <p>{visibleReservations.length === 1 ? "1 reservation shown" : `${visibleReservations.length} reservations shown`}</p>
              </div>
              <div className="reservations-list">
                {visibleReservations.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    onStatus={changeStatus}
                    onArrival={toggleArrived}
                  />
                ))}
              </div>
              {!visibleReservations.length ? <p className="empty-state">No reservations match these filters.</p> : null}
            </section>
          </>
        ) : view === "events" ? (
          <EventsEditor
            events={events}
            status={eventStatus}
            onAdd={addEvent}
            onDelete={deleteEvent}
            onUpdate={updateEvent}
            onSave={saveEvents}
          />
        ) : view === "cocktails" ? (
          <CocktailEditor
            cocktails={cocktails}
            status={cocktailStatus}
            onUpdate={updateCocktail}
            onImage={updateCocktailImage}
            onMenu={uploadMenu}
            onSave={saveCocktails}
          />
        ) : (
          <StatisticsView statistics={statistics} status={statisticsStatus} />
        )}

        {manualOpen ? (
          <ManualReservationModal
            status={manualStatus}
            onClose={() => {
              setManualOpen(false);
              setManualStatus("");
            }}
            onSave={saveManualReservation}
          />
        ) : null}
        {adminMessage ? (
          <AdminMessageModal
            {...adminMessage}
            onClose={() => setAdminMessage(null)}
          />
        ) : null}
      </section>
    </main>
  );
}

function AdminMessageModal({ kicker = "Update", title, message, detail = "", type = "success", onClose }) {
  return (
    <section className="admin-message-modal">
      <div className="admin-message-backdrop"></div>
      <div className={`admin-message-panel ${type === "error" ? "error" : ""}`} role="dialog" aria-modal="true" aria-labelledby="admin-message-title">
        <p className="eyebrow">{kicker}</p>
        <h2 id="admin-message-title">{title}</h2>
        <p>{message}</p>
        {detail ? <p className="admin-message-detail">{detail}</p> : null}
        <div className="admin-message-actions">
          <button type="button" onClick={onClose}>OK</button>
        </div>
      </div>
    </section>
  );
}

function plural(count, singular, pluralWord = `${singular}s`) {
  return Number(count) === 1 ? singular : pluralWord;
}

function FeaturedCustomer({ customer }) {
  if (!customer) return <p className="empty-state compact">No data yet.</p>;
  const reservations = Number(customer.reservations || 0);
  const guests = Number(customer.guests || 0);

  return (
    <div className="featured-stat">
      <strong>{customer.name || "Unknown customer"}</strong>
      <span>{customer.phone || "No phone"}</span>
      <p>{reservations} {plural(reservations, "booking")} · {guests} {plural(guests, "guest")}</p>
    </div>
  );
}

function FeaturedDate({ dateStat }) {
  if (!dateStat) return <p className="empty-state compact">No date data yet.</p>;

  return (
    <div className="featured-stat">
      <strong>{dateStat.display_date}</strong>
      <span>Most guests</span>
      <p>{Number(dateStat.guests || 0)} guests</p>
    </div>
  );
}

function CustomerLine({ customer, rank }) {
  const reservations = Number(customer.reservations || 0);
  const guests = Number(customer.guests || 0);

  return (
    <article className="customer-line">
      <span>{rank}</span>
      <div>
        <strong>{customer.name || "Unknown customer"}</strong>
        <p>{customer.phone || "No phone"}</p>
      </div>
      <div className="customer-numbers">
        <span>{reservations} {plural(reservations, "booking")}</span>
        <span>{guests} {plural(guests, "guest")}</span>
      </div>
    </article>
  );
}

function CustomerList({ customers }) {
  if (!customers?.length) return <p className="empty-state compact">No data yet.</p>;

  return customers.map((customer, index) => (
    <CustomerLine key={`${customer.phone || "customer"}-${index}`} customer={customer} rank={index + 1} />
  ));
}

function StatisticsSection({ title, subtitle, stats }) {
  return (
    <article className="statistics-card">
      <div className="statistics-card-heading">
        <div>
          {subtitle ? <p className="eyebrow">{subtitle}</p> : null}
          <h3>{title}</h3>
        </div>
      </div>
      <div className="statistics-grid">
        <section>
          <h4>Best customer</h4>
          <FeaturedCustomer customer={stats?.best_customer} />
        </section>
        <section>
          <h4>Date with most guests</h4>
          <FeaturedDate dateStat={stats?.most_guest_date} />
        </section>
        <section>
          <h4>Top five customers</h4>
          <CustomerList customers={stats?.top_customers} />
        </section>
      </div>
    </article>
  );
}

function StatisticsView({ statistics, status }) {
  return (
    <section className="statistics-view">
      <div className="panel-heading">
        <div>
          <h2>Statistics</h2>
        </div>
      </div>
      {status ? <p className="status-message event-status event-status-top" role="status" aria-live="polite">{status}</p> : null}
      <div className="statistics-list">
        {!status && !statistics ? <p className="empty-state">Statistics are not loaded yet.</p> : null}
        {statistics ? (
          <>
            <StatisticsSection title="All time" subtitle="Ever" stats={statistics.all_time} />
            {(statistics.seasons || []).map((season) => (
              <StatisticsSection
                key={season.year || season.label}
                title={season.label || `${season.year} season`}
                stats={season}
              />
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}

function CocktailEditor({ cocktails, status, onUpdate, onImage, onMenu, onSave }) {
  return (
    <section className="cocktails-view">
      <div className="panel-heading">
        <div>
          <h2>Cocktail Cards</h2>
          <p>Update the three images and labels shown on the website cocktail section.</p>
        </div>
        <div className="event-heading-actions">
          <label className="ghost-button menu-upload-button">
            Upload Menu
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => onMenu(event.target.files?.[0] || null)}
            />
          </label>
          <button type="submit" form="react-cocktail-editor">Save Cocktail Cards</button>
        </div>
      </div>
      {status ? <p className="status-message event-status event-status-top" role="status" aria-live="polite">{status}</p> : null}
      <form className="cocktail-editor" id="react-cocktail-editor" onSubmit={onSave}>
        <div className="cocktail-editor-grid">
          {cocktails.map((item, index) => (
            <article className="cocktail-editor-card" key={item.id || item.draftId}>
              <img src={item.preview || item.image} alt={item.alt || item.title || "Cartel cocktail"} />
              <h3>Picture {index + 1}</h3>
              <label className="upload-zone">
                <strong>Choose image</strong>
                <span>JPG, PNG, or WebP</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => onImage(index, event.target.files?.[0] || null)}
                />
              </label>
              <label>
                Span text
                <input
                  type="text"
                  value={item.eyebrow}
                  onChange={(event) => onUpdate(index, "eyebrow", event.target.value)}
                  required
                />
              </label>
              <label>
                Heading
                <input
                  type="text"
                  value={item.title}
                  onChange={(event) => onUpdate(index, "title", event.target.value)}
                  required
                />
              </label>
            </article>
          ))}
        </div>
      </form>
    </section>
  );
}

function EventsEditor({ events, status, onAdd, onDelete, onUpdate, onSave }) {
  return (
    <section className="events-admin-view">
      <div className="panel-heading">
        <div>
          <h2>Event Lineup</h2>
          <p>Add, edit, or remove the events shown on the website events section.</p>
        </div>
        <div className="event-heading-actions">
          <button type="button" className="ghost-button" onClick={onAdd}>Add Event</button>
          <button type="submit" form="react-event-editor">Save Events</button>
        </div>
      </div>
      {status && !status.toLowerCase().includes("saved") ? (
        <p className="status-message event-status event-status-top" role="status" aria-live="polite">{status}</p>
      ) : null}
      <form className="event-editor" id="react-event-editor" onSubmit={onSave}>
        <div className="event-editor-list">
          {events.map((item, index) => (
            <article className="event-editor-card" key={item.id || item.draftId}>
              <label className="event-calendar-field">
                Event Date
                <input type="date" value={item.date} onChange={(event) => onUpdate(index, "date", event.target.value)} required />
              </label>
              <label>
                Artist / Event Title
                <input value={item.title} onChange={(event) => onUpdate(index, "title", event.target.value)} required />
              </label>
              <label>
                Music Style
                <input value={item.music} onChange={(event) => onUpdate(index, "music", event.target.value)} required />
              </label>
              <button type="button" className="ghost-button event-remove" onClick={() => onDelete(index)}>Delete Event</button>
            </article>
          ))}
        </div>
      </form>
    </section>
  );
}

function ManualReservationModal({ status, onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    date: "",
    time: "",
    guests: 2,
    notes: "",
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(form);
  }

  return (
    <section className="manual-modal">
      <button type="button" className="manual-backdrop" aria-label="Close manual reservation form" onClick={onClose}></button>
      <form className="manual-panel" onSubmit={handleSubmit}>
        <div className="manual-heading">
          <div>
            <p className="eyebrow">Admin Entry</p>
            <h2>Add Reservation</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </div>
        <div className="manual-grid">
          <label>
            Name
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} autoComplete="name" required />
          </label>
          <label>
            Phone
            <input type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} autoComplete="tel" required />
          </label>
          <label>
            Date
            <input type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} required />
          </label>
          <label>
            Time
            <input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} required />
          </label>
          <label>
            Guests
            <input type="number" min="1" value={form.guests} onChange={(event) => updateField("guests", event.target.value)} required />
          </label>
          <label className="manual-notes">
            Notes
            <textarea
              rows="4"
              placeholder="Preferred area, celebration, or anything useful"
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            ></textarea>
          </label>
        </div>
        <div className="manual-actions">
          <button type="submit">Save Reservation</button>
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
        </div>
        <p className="status-message" role="status" aria-live="polite">{status}</p>
      </form>
    </section>
  );
}

function ReservationCard({ reservation, onStatus, onArrival }) {
  const arrived = hasArrived(reservation);
  const notes = reservation.notes || "No notes added.";
  const isCancelled = reservation.status === "cancelled";
  const arrivalClass = [
    "arrival-toggle",
    arrived ? "arrived" : "",
    isCancelled ? "locked" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={`reservation-card ${reservation.status}`} data-id={reservation.id}>
      <div className="reservation-date">
        <div>
          <strong>{reservation.display_date}</strong>
          <span>{reservation.reservation_time}</span>
        </div>
      </div>
      <div className="reservation-main">
        <h3>{reservation.name}</h3>
        <div className="reservation-meta">
          <div><span>Guests</span><strong>{reservation.guests}</strong></div>
          <div><span>Phone</span><strong>{reservation.phone}</strong></div>
          <div><span>Email</span><strong>{reservationEmailLabel(reservation)}</strong></div>
          <div><span>Email status</span><strong>{emailStatusLabel(reservation.notification_status)}</strong></div>
        </div>
        <p className="reservation-notes">{notes}</p>
      </div>
      <div className="reservation-actions">
        <span className={`status-pill ${reservation.status}`}>{statusLabel(reservation.status)}</span>
        <button
          type="button"
          className={arrivalClass}
          disabled={isCancelled}
          aria-disabled={isCancelled ? "true" : "false"}
          aria-pressed={arrived ? "true" : "false"}
          onClick={() => onArrival(reservation)}
        >
          <span>{arrived ? "✓" : ""}</span>
          {arrived ? "Arrived" : "Mark arrived"}
        </button>
        <div className="action-row">
          {["confirmed", "pending", "cancelled"].map((status) => (
            <button
              key={status}
              type="button"
              className={reservation.status === status ? "status-action active" : "status-action ghost-button"}
              aria-pressed={reservation.status === status ? "true" : "false"}
              onClick={() => onStatus(reservation, status)}
            >
              {status === "confirmed" ? "Confirmed" : status === "cancelled" ? "Cancel" : "Pending"}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
