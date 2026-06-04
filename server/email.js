import nodemailer from "nodemailer";
import { config } from "./config.js";
import { europeanDate } from "./format.js";

function smtpReady() {
  return Boolean(config.smtp.username && config.smtp.password && config.smtp.fromEmail);
}

function transporter() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.username,
      pass: config.smtp.password,
    },
  });
}

function reservationRows(reservation) {
  return [
    ["Name", reservation.name],
    ["Phone", reservation.phone],
    ["Email", reservation.email || "Admin manual entry"],
    ["Date", europeanDate(reservation.reservation_date || reservation.date)],
    ["Time", reservation.reservation_time || reservation.time],
    ["Guests", reservation.guests],
    ["Notes", reservation.notes || "No notes added."],
  ];
}

function luxuryHtml({ title, intro, reservation, closing }) {
  const rows = reservationRows(reservation)
    .map(([label, value]) => `
      <tr>
        <td style="padding:12px 0;color:#b9ad8e;font-size:12px;letter-spacing:.18em;text-transform:uppercase;">${label}</td>
        <td style="padding:12px 0;color:#f7efe0;font-size:16px;text-align:right;">${value}</td>
      </tr>
    `)
    .join("");

  return `
    <div style="margin:0;background:#070706;padding:32px;font-family:Arial,sans-serif;color:#f7efe0;">
      <div style="max-width:640px;margin:0 auto;border:1px solid rgba(205,161,90,.38);padding:34px;background:#0d0b08;">
        <p style="margin:0;color:#d6aa5e;font-size:12px;letter-spacing:.28em;text-transform:uppercase;">Cartel Cocktail Bar</p>
        <h1 style="margin:18px 0 0;color:#ead8b2;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.05;font-weight:500;">${title}</h1>
        <p style="margin:18px 0 0;color:rgba(247,239,224,.76);font-size:16px;line-height:1.7;">${intro}</p>
        <table style="width:100%;margin:28px 0;border-collapse:collapse;border-top:1px solid rgba(205,161,90,.24);border-bottom:1px solid rgba(205,161,90,.24);">${rows}</table>
        <p style="margin:0;color:#ead8b2;font-size:16px;line-height:1.7;">${closing}</p>
      </div>
    </div>
  `;
}

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!smtpReady()) return { status: "not_sent", reason: "SMTP is not configured." };
  await transporter().sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
    to,
    subject,
    html,
    text,
    replyTo,
  });
  return { status: "sent" };
}

export function sendAdminReservationEmail(reservation) {
  return sendMail({
    to: config.smtp.adminEmail,
    subject: "Cartel reservation request",
    replyTo: reservation.email,
    text: `New reservation request: ${reservation.name}, ${reservation.phone}, ${europeanDate(reservation.date)}, ${reservation.time}, ${reservation.guests} guests.`,
    html: luxuryHtml({
      title: "Reservation request",
      intro: "A new reservation request has arrived and is waiting for admin confirmation.",
      reservation,
      closing: "Confirm the reservation from the admin dashboard when the table is ready.",
    }),
  });
}

export function sendCustomerConfirmationEmail(reservation) {
  return sendMail({
    to: reservation.email,
    subject: "Your Cartel reservation is confirmed",
    text: `Your Cartel reservation is confirmed for ${europeanDate(reservation.reservation_date || reservation.date)} at ${reservation.reservation_time || reservation.time}.`,
    html: luxuryHtml({
      title: "Your table is confirmed",
      intro: "Your Cartel reservation has been confirmed. Your evening on the Protaras strip is waiting.",
      reservation,
      closing: "We look forward to welcoming you for signature cocktails, attentive service, and an unforgettable night.",
    }),
  });
}

export function sendManualAdminEmail(reservation) {
  return sendMail({
    to: config.smtp.adminEmail,
    subject: "Manual Cartel reservation added",
    text: `Manual reservation added: ${reservation.name}, ${reservation.phone}, ${europeanDate(reservation.reservation_date || reservation.date)}, ${reservation.reservation_time || reservation.time}, ${reservation.guests} guests.`,
    html: luxuryHtml({
      title: "Manual reservation",
      intro: "A manual reservation has been added by the admin team.",
      reservation: {
        ...reservation,
        email: "Admin manual entry",
      },
      closing: "This booking is confirmed in the admin dashboard.",
    }),
  });
}

export function sendEmailVerificationCode(email, code) {
  return sendMail({
    to: email,
    subject: "Your Cartel reservation code",
    text: `Your Cartel reservation code is ${code}.`,
    html: `
      <div style="margin:0;background:#070706;padding:32px;font-family:Arial,sans-serif;color:#f7efe0;">
        <div style="max-width:560px;margin:0 auto;border:1px solid rgba(205,161,90,.38);padding:34px;background:#0d0b08;text-align:center;">
          <p style="margin:0;color:#d6aa5e;font-size:12px;letter-spacing:.28em;text-transform:uppercase;">Cartel Cocktail Bar</p>
          <h1 style="margin:18px 0 0;color:#ead8b2;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1;">Verify your email</h1>
          <p style="margin:18px 0;color:rgba(247,239,224,.72);font-size:16px;line-height:1.7;">Enter this code on the reservation form to continue.</p>
          <strong style="display:inline-block;padding:18px 28px;border:1px solid rgba(205,161,90,.48);color:#f7efe0;font-size:34px;letter-spacing:.28em;">${code}</strong>
        </div>
      </div>
    `,
  });
}
