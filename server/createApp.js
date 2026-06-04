import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import multer from "multer";
import { config } from "./config.js";
import { sendAdminReservationEmail, sendCustomerConfirmationEmail, sendEmailVerificationCode, sendManualAdminEmail } from "./email.js";
import { cleanText, europeanDate, eventParts, normalizeEmail, phoneKey, seasonYear } from "./format.js";
import { supabaseAdmin } from "./supabase.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const validStatuses = new Set(["pending", "confirmed", "cancelled"]);
const cocktailImageBucket = "cartel-assets";
const menuFolder = "menu";

function requireAdmin(req, res, next) {
  const token = req.cookies?.cartel_admin
    || req.headers.authorization?.replace(/^Bearer\s+/i, "")
    || req.headers["x-admin-token"];
  const tokenBuffer = Buffer.from(token || "");
  const secretBuffer = Buffer.from(config.adminSessionSecret);
  if (tokenBuffer.length === secretBuffer.length && crypto.timingSafeEqual(tokenBuffer, secretBuffer)) {
    return next();
  }
  return res.status(401).json({ ok: false, error: "Admin login required." });
}

function isAdminRequest(req) {
  const token = req.cookies?.cartel_admin
    || req.headers.authorization?.replace(/^Bearer\s+/i, "")
    || req.headers["x-admin-token"];
  const tokenBuffer = Buffer.from(token || "");
  const secretBuffer = Buffer.from(config.adminSessionSecret);
  return tokenBuffer.length === secretBuffer.length && crypto.timingSafeEqual(tokenBuffer, secretBuffer);
}

function isLocalRequest(req) {
  const host = String(req.headers.host || req.hostname || "");
  return host.startsWith("127.0.0.1")
    || host.startsWith("localhost")
    || host.startsWith("[::1]");
}

function isLocalVerificationBypass(req, code) {
  return isLocalRequest(req) && code === "000000";
}

async function safeEmail(task) {
  try {
    return await task();
  } catch (error) {
    return {
      status: "not_sent",
      reason: error?.message || "Email could not be sent.",
    };
  }
}

function reservationPayload(body) {
  const reservation = {
    name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 60),
    phone_key: phoneKey(body.phone),
    email: normalizeEmail(body.email),
    reservation_date: cleanText(body.date || body.reservation_date, 20),
    reservation_time: cleanText(body.time || body.reservation_time, 20),
    guests: Number(body.guests || 0),
    notes: cleanText(body.notes, 1000),
  };

  if (!reservation.name) throw new Error("Please enter the guest name.");
  if (!reservation.phone) throw new Error("Please enter the guest phone number.");
  if (!reservation.phone_key) throw new Error("Please enter a valid phone number.");
  if (!reservation.email) throw new Error("Please enter the guest email.");
  if (!reservation.reservation_date) throw new Error("Please choose a date.");
  if (!reservation.reservation_time) throw new Error("Please choose a time.");
  if (reservation.guests < 1) throw new Error("Please enter at least 1 guest.");

  return reservation;
}

function manualReservationPayload(body) {
  const reservation = {
    name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 60),
    phone_key: phoneKey(body.phone),
    email: "",
    reservation_date: cleanText(body.date || body.reservation_date, 20),
    reservation_time: cleanText(body.time || body.reservation_time, 20),
    guests: Number(body.guests || 0),
    notes: cleanText(body.notes, 1000),
  };

  if (!reservation.name) throw new Error("Please enter the guest name.");
  if (!reservation.phone) throw new Error("Please enter the guest phone number.");
  if (!reservation.phone_key) throw new Error("Please enter a valid phone number.");
  if (!reservation.reservation_date) throw new Error("Please choose a date.");
  if (!reservation.reservation_time) throw new Error("Please choose a time.");
  if (reservation.guests < 1) throw new Error("Please enter at least 1 guest.");

  return reservation;
}

function normalizeReservation(row) {
  return {
    ...row,
    date: row.reservation_date,
    time: row.reservation_time,
    display_date: row.reservation_date?.split("-").reverse().join("/") || "",
    arrived: Boolean(row.arrived),
  };
}

function imageExtension(file) {
  const byMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (byMime[file.mimetype]) return byMime[file.mimetype];
  const match = String(file.originalname || "").match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "jpg";
}

async function ensureCocktailBucket(supabase) {
  const bucketOptions = {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  };
  const { error } = await supabase.storage.createBucket(cocktailImageBucket, bucketOptions);
  if (error && error.statusCode !== "409" && !/already exists/i.test(error.message || "")) {
    throw error;
  }
  await supabase.storage.updateBucket(cocktailImageBucket, bucketOptions).catch(() => {});
}

async function uploadCocktailImage(supabase, file, index) {
  await ensureCocktailBucket(supabase);
  const ext = imageExtension(file);
  const path = `cocktail-cards/cocktail-${index + 1}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(cocktailImageBucket)
    .upload(path, file.buffer, {
      contentType: file.mimetype || "image/jpeg",
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from(cocktailImageBucket).getPublicUrl(path);
  return data.publicUrl;
}

function menuExtension(file) {
  if (file.mimetype === "application/pdf") return "pdf";
  return imageExtension(file);
}

function menuFilePayload(file) {
  const ext = menuExtension(file);
  if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext)) {
    throw new Error("Please upload a PDF, JPG, PNG, or WebP menu file.");
  }
  return {
    ext,
    path: `${menuFolder}/cartel-menu.${ext === "jpeg" ? "jpg" : ext}`,
    contentType: file.mimetype || (ext === "pdf" ? "application/pdf" : "image/jpeg"),
  };
}

async function currentMenu(supabase) {
  await ensureCocktailBucket(supabase);
  const { data, error } = await supabase.storage.from(cocktailImageBucket).list(menuFolder, {
    limit: 20,
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (error) throw error;
  const file = (data || []).find((item) => /^cartel-menu\.(pdf|jpg|jpeg|png|webp)$/i.test(item.name));
  if (!file) return null;
  const path = `${menuFolder}/${file.name}`;
  const { data: publicData } = supabase.storage.from(cocktailImageBucket).getPublicUrl(path);
  return {
    url: publicData.publicUrl,
    type: file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
    name: file.name,
  };
}

async function uploadMenuFile(supabase, file) {
  await ensureCocktailBucket(supabase);
  const payload = menuFilePayload(file);
  await Promise.all(["pdf", "jpg", "png", "webp"].map((ext) => (
    ext === payload.ext ? Promise.resolve() : supabase.storage.from(cocktailImageBucket).remove([`${menuFolder}/cartel-menu.${ext}`])
  )));
  const { error } = await supabase.storage.from(cocktailImageBucket).upload(payload.path, file.buffer, {
    contentType: payload.contentType,
    upsert: true,
  });
  if (error) throw error;
  return currentMenu(supabase);
}

function emptyCustomerStats() {
  return {
    name: "",
    phone: "",
    reservations: 0,
    guests: 0,
    cancelled: 0,
    cancelled_guests: 0,
  };
}

function customerSummary(customer) {
  if (!customer) return null;
  return {
    name: customer.name,
    phone: customer.phone,
    reservations: customer.reservations,
    guests: customer.guests,
    cancelled: customer.cancelled,
    cancelled_guests: customer.cancelled_guests,
  };
}

function topCustomers(customers, mode, limit = 5) {
  const metric = mode === "worst" ? "cancelled" : "reservations";
  return [...customers.values()]
    .filter((customer) => customer[metric] > 0)
    .map(customerSummary)
    .sort((a, b) => (
      b[metric] - a[metric]
      || b.guests - a.guests
      || b.reservations - a.reservations
    ))
    .slice(0, limit);
}

function bestGuestDate(dateTotals) {
  const entries = [...dateTotals.entries()];
  if (!entries.length) return null;
  const [date, guests] = entries.sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  return { date, display_date: europeanDate(date), guests };
}

function buildStatisticsFromRows(rows) {
  const allCustomers = new Map();
  const allDateTotals = new Map();
  const seasons = new Map();

  rows.forEach((item) => {
    const key = item.phone_key || phoneKey(item.phone);
    const guests = Number(item.guests || 0);
    const date = item.reservation_date;
    const year = seasonYear(date);
    const customer = allCustomers.get(key) || emptyCustomerStats();
    customer.name = item.name || customer.name;
    customer.phone = item.phone || customer.phone;

    if (item.status === "cancelled") {
      customer.cancelled += 1;
      customer.cancelled_guests += guests;
    } else {
      customer.reservations += 1;
      customer.guests += guests;
      allDateTotals.set(date, (allDateTotals.get(date) || 0) + guests);
    }
    allCustomers.set(key, customer);

    if (!year) return;

    const season = seasons.get(year) || { year, customers: new Map(), dateTotals: new Map() };
    const seasonCustomer = season.customers.get(key) || emptyCustomerStats();
    seasonCustomer.name = item.name || seasonCustomer.name;
    seasonCustomer.phone = item.phone || seasonCustomer.phone;
    if (item.status === "cancelled") {
      seasonCustomer.cancelled += 1;
      seasonCustomer.cancelled_guests += guests;
    } else {
      seasonCustomer.reservations += 1;
      seasonCustomer.guests += guests;
      season.dateTotals.set(date, (season.dateTotals.get(date) || 0) + guests);
    }
    season.customers.set(key, seasonCustomer);
    seasons.set(year, season);
  });

  return {
    all_time: {
      best_customer: topCustomers(allCustomers, "best", 1)[0] || null,
      top_customers: topCustomers(allCustomers, "best"),
      most_guest_date: bestGuestDate(allDateTotals),
    },
    seasons: [...seasons.values()]
      .sort((a, b) => b.year - a.year)
      .map((season) => ({
        year: season.year,
        label: `${season.year} season`,
        best_customer: topCustomers(season.customers, "best", 1)[0] || null,
        top_customers: topCustomers(season.customers, "best"),
        worst_customers: topCustomers(season.customers, "worst"),
        most_guest_date: bestGuestDate(season.dateTotals),
      })),
  };
}

function sixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      supabase: Boolean(config.supabaseUrl && config.supabaseServiceRoleKey),
      smtp: Boolean(config.smtp.username && config.smtp.password && config.smtp.fromEmail),
      admin: Boolean(config.adminPassword && config.adminSessionSecret),
      environment: process.env.VERCEL ? "vercel" : "local",
    });
  });

  app.get("/api/site/events", async (req, res) => {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("events")
      .select("id,date,day,month,title,music,display_order")
      .order("date", { ascending: true })
      .order("display_order", { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, events: data || [] });
  });

  app.get("/api/site/cocktails", async (req, res) => {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("cocktail_cards")
      .select("id,image,alt,eyebrow,title,display_order")
      .order("display_order", { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, cocktails: data || [] });
  });

  app.get("/api/site/menu", async (req, res) => {
    try {
      const supabase = supabaseAdmin();
      return res.json({ ok: true, menu: await currentMenu(supabase) });
    } catch (error) {
      return res.json({ ok: true, menu: null });
    }
  });

  app.post("/api/email-verification", async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      if (!email || !email.includes("@")) throw new Error("Please enter a valid email address.");
      const code = sixDigitCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const supabase = supabaseAdmin();
      const { error } = await supabase
        .from("email_verifications")
        .insert({ email, code, expires_at: expiresAt });
      if (error) throw error;
      const notification = await sendEmailVerificationCode(email, code);
      if (notification.status !== "sent") {
        return res.status(400).json({ ok: false, error: "We could not send a verification code to that email.", notification });
      }
      return res.json({ ok: true, notification });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/email-verification/check", async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const code = cleanText(req.body.code, 12);
    if (isLocalVerificationBypass(req, code)) {
      return res.json({ ok: true, local_bypass: true });
    }
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("email_verifications")
      .select("id")
      .eq("email", email)
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return res.status(400).json({ ok: false, error: "The verification code is not correct or has expired." });
    return res.json({ ok: true });
  });

  app.post("/api/reservations", async (req, res) => {
    try {
      const reservation = reservationPayload(req.body);
      const emailCode = cleanText(req.body.email_code, 12);
      const supabase = supabaseAdmin();
      let verification = null;
      if (!isLocalVerificationBypass(req, emailCode)) {
        const { data } = await supabase
          .from("email_verifications")
          .select("id")
          .eq("email", reservation.email)
          .eq("code", emailCode)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        verification = data;
        if (!verification) throw new Error("Please enter the verification code sent to your email.");
      }

      const { data, error } = await supabase
        .from("reservations")
        .insert({
          ...reservation,
          status: "pending",
          notification_status: "not_sent",
          booking_source: "website",
        })
        .select("id")
        .single();
      if (error?.code === "23505") throw new Error("This phone number already has a reservation for that date.");
      if (error) throw error;

      if (verification?.id) {
        await supabase.from("email_verifications").update({ used_at: new Date().toISOString() }).eq("id", verification.id);
      }
      const notification = await safeEmail(() => (
        sendAdminReservationEmail({ ...reservation, date: reservation.reservation_date, time: reservation.reservation_time })
      ));
      return res.status(201).json({ ok: true, reservation_id: data.id, notification });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/admin/login", (req, res) => {
    if (req.body.password !== config.adminPassword) {
      return res.status(401).json({ ok: false, error: "Incorrect password." });
    }
    res.cookie("cartel_admin", config.adminSessionSecret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return res.json({ ok: true, token: config.adminSessionSecret });
  });

  app.get("/api/admin/session", (req, res) => {
    const authenticated = isAdminRequest(req);
    res.json({
      ok: true,
      authenticated,
      token: authenticated ? config.adminSessionSecret : null,
    });
  });

  app.post("/api/admin/logout", (req, res) => {
    res.clearCookie("cartel_admin", { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/admin/reservations", requireAdmin, async (req, res) => {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .order("reservation_date", { ascending: false })
      .order("reservation_time", { ascending: false })
      .order("id", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, reservations: (data || []).map(normalizeReservation) });
  });

  app.get("/api/admin/statistics", requireAdmin, async (req, res) => {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("reservations")
      .select("name,phone,phone_key,reservation_date,guests,status")
      .order("reservation_date", { ascending: true })
      .order("id", { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, statistics: buildStatisticsFromRows(data || []) });
  });

  app.post("/api/admin/reservations/status", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.body.id);
      const status = cleanText(req.body.status, 20);
      if (!validStatuses.has(status)) throw new Error("Invalid reservation status.");
      const supabase = supabaseAdmin();
      const { data: reservation, error: readError } = await supabase.from("reservations").select("*").eq("id", id).single();
      if (readError) throw readError;

      let notification = null;
      let notificationStatus = reservation.notification_status;
      if (status === "confirmed" && reservation.booking_source !== "manual" && notificationStatus !== "sent") {
        notification = await safeEmail(() => sendCustomerConfirmationEmail(reservation));
        notificationStatus = notification.status === "sent" ? "sent" : "not_sent";
      }

      const { data, error } = await supabase
        .from("reservations")
        .update({ status, notification_status: notificationStatus })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return res.json({ ok: true, notification, reservation: normalizeReservation(data) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/admin/reservations/arrival", requireAdmin, async (req, res) => {
    const id = Number(req.body.id);
    const arrived = Boolean(req.body.arrived);
    const supabase = supabaseAdmin();
    const { data: reservation } = await supabase.from("reservations").select("status,arrival_previous_status").eq("id", id).single();
    if (!reservation) return res.status(404).json({ ok: false, error: "Reservation not found." });
    const update = arrived
      ? { arrived: true, arrival_previous_status: reservation.status, status: "confirmed" }
      : { arrived: false, arrival_previous_status: null, status: reservation.arrival_previous_status || "pending" };
    const { error } = await supabase.from("reservations").update(update).eq("id", id);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    return res.json({ ok: true });
  });

  app.post("/api/admin/reservations/manual", requireAdmin, async (req, res) => {
    try {
      const reservation = manualReservationPayload(req.body);
      const supabase = supabaseAdmin();
      const { data, error } = await supabase
        .from("reservations")
        .insert({
          ...reservation,
          status: "confirmed",
          notification_status: "not_sent",
          booking_source: "manual",
        })
        .select("id")
        .single();
      if (error?.code === "23505") throw new Error("This phone number already has a reservation for that date.");
      if (error) throw error;
      const notification = await sendManualAdminEmail({
        ...reservation,
        date: reservation.reservation_date,
        time: reservation.reservation_time,
      });
      return res.status(201).json({ ok: true, reservation_id: data.id, notification });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/admin/events", requireAdmin, async (req, res) => {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.from("events").select("*").order("date").order("display_order");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, events: data || [] });
  });

  app.post("/api/admin/events", requireAdmin, async (req, res) => {
    try {
      const events = (req.body.events || []).map((item, index) => {
        const date = cleanText(item.date, 20);
        const parts = eventParts(date);
        return {
          date,
          day: parts.day,
          month: parts.month,
          title: cleanText(item.title, 120),
          music: cleanText(item.music, 120),
          display_order: index,
        };
      }).filter((item) => item.date && item.title && item.music);
      const supabase = supabaseAdmin();
      await supabase.from("events").delete().neq("id", 0);
      const { data, error } = await supabase.from("events").insert(events).select("*");
      if (error) throw error;
      return res.json({ ok: true, events: data || [] });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/admin/cocktails", requireAdmin, async (req, res) => {
    const supabase = supabaseAdmin();
    const { data, error } = await supabase.from("cocktail_cards").select("*").order("display_order");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, cocktails: data || [] });
  });

  app.get("/api/admin/menu", requireAdmin, async (req, res) => {
    try {
      const supabase = supabaseAdmin();
      return res.json({ ok: true, menu: await currentMenu(supabase) });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/admin/menu", requireAdmin, upload.single("menu"), async (req, res) => {
    try {
      if (!req.file) throw new Error("Please choose a menu file.");
      const supabase = supabaseAdmin();
      const menu = await uploadMenuFile(supabase, req.file);
      return res.json({ ok: true, menu });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/admin/cocktails", requireAdmin, upload.any(), async (req, res) => {
    try {
      const supabase = supabaseAdmin();
      const count = Math.max(1, Math.min(6, Number(req.body.card_count || 3)));
      const files = req.files || [];
      const saved = [];

      for (let index = 0; index < count; index += 1) {
        const id = Number(req.body[`id_${index}`] || 0) || null;
        const existingImage = cleanText(req.body[`existing_image_${index}`], 1200);
        const title = cleanText(req.body[`title_${index}`], 120);
        const eyebrow = cleanText(req.body[`eyebrow_${index}`], 80);
        const alt = cleanText(req.body[`alt_${index}`], 220) || `${title || "Cartel cocktail"} at Cartel Cocktail Bar`;
        const file = files.find((item) => item.fieldname === `image_${index}`);

        if (!title) throw new Error(`Please enter a heading for picture ${index + 1}.`);
        if (!eyebrow) throw new Error(`Please enter span text for picture ${index + 1}.`);

        const image = file ? await uploadCocktailImage(supabase, file, index) : existingImage;
        if (!image) throw new Error(`Please choose an image for picture ${index + 1}.`);

        const payload = {
          image,
          alt,
          eyebrow,
          title,
          display_order: index,
          updated_at: new Date().toISOString(),
        };

        if (id) {
          const { data, error } = await supabase
            .from("cocktail_cards")
            .update(payload)
            .eq("id", id)
            .select("*")
            .single();
          if (error) throw error;
          saved.push(data);
        } else {
          const { data, error } = await supabase
            .from("cocktail_cards")
            .insert(payload)
            .select("*")
            .single();
          if (error) throw error;
          saved.push(data);
        }
      }

      return res.json({ ok: true, cocktails: saved });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  return app;
}
