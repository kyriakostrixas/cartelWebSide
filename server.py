#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import email.message
import hashlib
import hmac
import html
import json
import os
import re
import sqlite3
import smtplib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "reservations.db"
MANAGER_EMAIL = "kyriakos.10@live.com"
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VALID_RESERVATION_STATUSES = {"pending", "confirmed", "cancelled"}


def load_env_files() -> None:
    for env_path in (ROOT / ".env", ROOT / "email-settings.env"):
        if not env_path.exists():
            continue

        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ[key] = value


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                reservation_date TEXT NOT NULL,
                reservation_time TEXT NOT NULL,
                guests INTEGER NOT NULL,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                notification_status TEXT NOT NULL DEFAULT 'not_configured',
                arrived INTEGER NOT NULL DEFAULT 0,
                arrival_previous_status TEXT,
                booking_source TEXT NOT NULL DEFAULT 'website',
                created_at TEXT NOT NULL
            )
            """
        )
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(reservations)").fetchall()
        }
        if "email" not in columns:
            connection.execute(
                "ALTER TABLE reservations ADD COLUMN email TEXT NOT NULL DEFAULT ''"
            )
        if "arrived" not in columns:
            connection.execute(
                "ALTER TABLE reservations ADD COLUMN arrived INTEGER NOT NULL DEFAULT 0"
            )
        if "arrival_previous_status" not in columns:
            connection.execute(
                "ALTER TABLE reservations ADD COLUMN arrival_previous_status TEXT"
            )
        if "booking_source" not in columns:
            connection.execute(
                "ALTER TABLE reservations ADD COLUMN booking_source TEXT NOT NULL DEFAULT 'website'"
            )
        connection.execute(
            """
            UPDATE reservations
            SET notification_status = 'not_sent'
            WHERE notification_status = 'not_configured'
            """
        )


def admin_password() -> str:
    return os.getenv("ADMIN_PASSWORD", "cartel-admin")


def admin_session_token() -> str:
    return hmac.new(
        admin_password().encode("utf-8"),
        b"cartel-admin-session",
        hashlib.sha256,
    ).hexdigest()


def parse_cookies(cookie_header: str) -> dict:
    cookies = {}
    for part in cookie_header.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        cookies[key.strip()] = value.strip()
    return cookies


def is_admin_authenticated(headers) -> bool:
    token = headers.get("X-Admin-Token", "")
    return hmac.compare_digest(token, admin_session_token())


def clean_text(value: object, limit: int) -> str:
    return str(value or "").strip()[:limit]


def validate_reservation(data: dict) -> dict:
    reservation = {
        "name": clean_text(data.get("name"), 120),
        "phone": clean_text(data.get("phone"), 60),
        "email": clean_text(data.get("email"), 160).lower(),
        "date": clean_text(data.get("date"), 20),
        "time": clean_text(data.get("time"), 20),
        "notes": clean_text(data.get("notes"), 500),
    }

    try:
        reservation["guests"] = int(data.get("guests"))
    except (TypeError, ValueError):
        raise ValueError("Please enter the number of guests.")

    if not reservation["name"]:
        raise ValueError("Please enter your name.")
    if not reservation["phone"]:
        raise ValueError("Please enter your phone number.")
    if not EMAIL_PATTERN.match(reservation["email"]):
        raise ValueError("Please enter a valid email address.")
    if not reservation["date"]:
        raise ValueError("Please choose a date.")
    if not reservation["time"]:
        raise ValueError("Please choose a time.")
    if reservation["guests"] < 1:
        raise ValueError("Please enter at least 1 guest.")

    return reservation


def validate_manual_reservation(data: dict) -> dict:
    reservation = {
        "name": clean_text(data.get("name"), 120),
        "phone": clean_text(data.get("phone"), 60),
        "email": "",
        "date": clean_text(data.get("date"), 20),
        "time": clean_text(data.get("time"), 20),
        "notes": clean_text(data.get("notes"), 500),
    }

    try:
        reservation["guests"] = int(data.get("guests"))
    except (TypeError, ValueError):
        raise ValueError("Please enter the number of guests.")

    if not reservation["name"]:
        raise ValueError("Please enter the guest name.")
    if not reservation["phone"]:
        raise ValueError("Please enter the guest phone number.")
    if not reservation["date"]:
        raise ValueError("Please choose a date.")
    if not reservation["time"]:
        raise ValueError("Please choose a time.")
    if reservation["guests"] < 1:
        raise ValueError("Please enter at least 1 guest.")

    return reservation


def save_reservation(
    reservation: dict,
    *,
    status: str = "pending",
    notification_status: str = "not_configured",
    booking_source: str = "website",
) -> int:
    created_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    with sqlite3.connect(DB_PATH) as connection:
        cursor = connection.execute(
            """
            INSERT INTO reservations (
                name, phone, email, reservation_date, reservation_time, guests, notes,
                status, notification_status, booking_source, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reservation["name"],
                reservation["phone"],
                reservation["email"],
                reservation["date"],
                reservation["time"],
                reservation["guests"],
                reservation["notes"],
                status,
                notification_status,
                booking_source,
                created_at,
            ),
        )
        return int(cursor.lastrowid)


def list_reservations() -> list[dict]:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            UPDATE reservations
            SET status = 'pending'
            WHERE notification_status IN ('not_sent', 'failed', 'not_configured')
              AND status = 'confirmed'
              AND booking_source != 'manual'
            """
        )
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT
                id, name, phone, email, reservation_date, reservation_time, guests,
                notes, status, notification_status, arrived, arrival_previous_status,
                booking_source, created_at
            FROM reservations
            ORDER BY reservation_date DESC, reservation_time DESC, id DESC
            """
        ).fetchall()

    reservations = []
    for row in rows:
        item = dict(row)
        item["display_date"] = european_date(item["reservation_date"])
        item["arrived"] = bool(item["arrived"])
        reservations.append(item)
    return reservations


def update_reservation_status(reservation_id: int, status: str) -> bool:
    if status not in VALID_RESERVATION_STATUSES:
        raise ValueError("Invalid reservation status.")

    with sqlite3.connect(DB_PATH) as connection:
        cursor = connection.execute(
            "UPDATE reservations SET status = ? WHERE id = ?",
            (status, reservation_id),
        )
        return cursor.rowcount > 0


def update_reservation_arrival(reservation_id: int, arrived: bool) -> bool:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        reservation = connection.execute(
            "SELECT status, arrival_previous_status FROM reservations WHERE id = ?",
            (reservation_id,),
        ).fetchone()
        if reservation is None:
            return False

        if arrived:
            cursor = connection.execute(
                """
                UPDATE reservations
                SET arrived = 1,
                    arrival_previous_status = ?,
                    status = 'confirmed'
                WHERE id = ?
                """,
                (reservation["status"], reservation_id),
            )
        else:
            previous_status = reservation["arrival_previous_status"] or "pending"
            if previous_status not in VALID_RESERVATION_STATUSES:
                previous_status = "pending"
            cursor = connection.execute(
                """
                UPDATE reservations
                SET arrived = 0,
                    status = ?,
                    arrival_previous_status = NULL
                WHERE id = ?
                """,
                (previous_status, reservation_id),
            )
        return cursor.rowcount > 0


def mark_notification(reservation_id: int, status: str) -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            "UPDATE reservations SET notification_status = ? WHERE id = ?",
            (status, reservation_id),
        )


def european_date(value: str) -> str:
    try:
        return dt.date.fromisoformat(value).strftime("%d/%m/%Y")
    except ValueError:
        return value


def season_year(value: str) -> int | None:
    try:
        date = dt.date.fromisoformat(value)
    except ValueError:
        return None

    season_start = dt.date(date.year, 4, 1)
    season_end = dt.date(date.year, 11, 15)
    if season_start <= date <= season_end:
        return date.year
    return None


def customer_key(phone: str) -> str:
    return re.sub(r"\D+", "", phone or "") or "unknown"


def empty_customer_stats() -> dict:
    return {
        "name": "",
        "phone": "",
        "reservations": 0,
        "guests": 0,
        "cancelled": 0,
        "cancelled_guests": 0,
    }


def customer_summary(customer: dict | None) -> dict | None:
    if not customer:
        return None
    return {
        "name": customer["name"],
        "phone": customer["phone"],
        "reservations": customer["reservations"],
        "guests": customer["guests"],
        "cancelled": customer["cancelled"],
        "cancelled_guests": customer["cancelled_guests"],
    }


def top_customers(customers: dict, *, mode: str, limit: int = 5) -> list[dict]:
    metric = "cancelled" if mode == "worst" else "reservations"
    candidates = [
        customer_summary(customer)
        for customer in customers.values()
        if customer[metric] > 0
    ]
    return sorted(
        candidates,
        key=lambda item: (item[metric], item["guests"], item["reservations"]),
        reverse=True,
    )[:limit]


def best_guest_date(date_totals: dict) -> dict | None:
    if not date_totals:
        return None
    date, guests = max(date_totals.items(), key=lambda item: (item[1], item[0]))
    return {"date": date, "display_date": european_date(date), "guests": guests}


def build_statistics() -> dict:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT
                name, phone, reservation_date, guests, status
            FROM reservations
            ORDER BY reservation_date ASC, id ASC
            """
        ).fetchall()

    all_customers = {}
    all_date_totals = {}
    seasons = {}

    for row in rows:
        item = dict(row)
        key = customer_key(item["phone"])
        status = item["status"]
        guests = int(item["guests"] or 0)
        date = item["reservation_date"]
        year = season_year(date)

        customer = all_customers.setdefault(key, empty_customer_stats())
        customer["name"] = item["name"] or customer["name"]
        customer["phone"] = item["phone"] or customer["phone"]
        if status == "cancelled":
            customer["cancelled"] += 1
            customer["cancelled_guests"] += guests
        else:
            customer["reservations"] += 1
            customer["guests"] += guests
            all_date_totals[date] = all_date_totals.get(date, 0) + guests

        if year is None:
            continue

        season = seasons.setdefault(
            year,
            {"year": year, "customers": {}, "date_totals": {}},
        )
        season_customer = season["customers"].setdefault(key, empty_customer_stats())
        season_customer["name"] = item["name"] or season_customer["name"]
        season_customer["phone"] = item["phone"] or season_customer["phone"]
        if status == "cancelled":
            season_customer["cancelled"] += 1
            season_customer["cancelled_guests"] += guests
        else:
            season_customer["reservations"] += 1
            season_customer["guests"] += guests
            season["date_totals"][date] = season["date_totals"].get(date, 0) + guests

    season_list = []
    for year in sorted(seasons.keys(), reverse=True):
        season = seasons[year]
        worst = top_customers(season["customers"], mode="worst", limit=5)
        season_list.append(
            {
                "year": year,
                "label": f"{year} season",
                "period": f"01/04/{year} - 15/11/{year}",
                "best_customer": (
                    top_customers(season["customers"], mode="best", limit=1) or [None]
                )[0],
                "top_customers": top_customers(season["customers"], mode="best"),
                "worst_customers": worst,
                "most_guest_date": best_guest_date(season["date_totals"]),
            }
        )

    return {
        "all_time": {
            "best_customer": (
                top_customers(all_customers, mode="best", limit=1) or [None]
            )[0],
            "top_customers": top_customers(all_customers, mode="best"),
            "worst_customers": top_customers(all_customers, mode="worst"),
            "most_guest_date": best_guest_date(all_date_totals),
        },
        "seasons": season_list,
    }


def email_text_body(reservation: dict) -> str:
    notes = reservation["notes"] or "No notes added."
    return "\n".join(
        [
            "Cartel reservation request received",
            "",
            f"Name: {reservation['name']}",
            f"Phone: {reservation['phone']}",
            f"Email: {reservation['email']}",
            f"Date: {european_date(reservation['date'])}",
            f"Time: {reservation['time']}",
            f"Guests: {reservation['guests']}",
            f"Notes: {notes}",
            "",
            "Your night at Cartel is waiting. Expect polished cocktails, warm service, and a beautiful evening on the Protaras strip.",
        ]
    )


def email_html_body(reservation: dict) -> str:
    notes = reservation["notes"] or "No notes added."
    details = [
        ("Name", reservation["name"]),
        ("Phone", reservation["phone"]),
        ("Email", reservation["email"]),
        ("Date", european_date(reservation["date"])),
        ("Time", reservation["time"]),
        ("Guests", str(reservation["guests"])),
        ("Notes", notes),
    ]
    detail_rows = "\n".join(
        f"""
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid rgba(205,161,90,0.18);color:#cda15a;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">{html.escape(label)}</td>
          <td style="padding:14px 0;border-bottom:1px solid rgba(205,161,90,0.18);color:#f7efe0;font-size:16px;line-height:1.5;text-align:right;">{html.escape(value)}</td>
        </tr>
        """
        for label, value in details
    )

    return f"""<!doctype html>
<html>
  <body style="margin:0;background:#070706;color:#f7efe0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070706;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border:1px solid rgba(205,161,90,0.32);background:#11100d;">
            <tr>
              <td style="padding:34px 34px 22px;border-bottom:1px solid rgba(205,161,90,0.2);background:linear-gradient(135deg,#17120b,#070706);">
                <div style="color:#cda15a;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Cocktail Bar · Protaras</div>
                <h1 style="margin:18px 0 0;color:#ead8b2;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1;font-weight:500;">Cartel reservation</h1>
                <p style="margin:18px 0 0;color:rgba(247,239,224,0.72);font-size:16px;line-height:1.7;">Your reservation request has been received with the details below.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 34px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  {detail_rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 34px 36px;">
                <p style="margin:0;color:#ead8b2;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25;">Your night at Cartel is waiting.</p>
                <p style="margin:12px 0 0;color:rgba(247,239,224,0.72);font-size:16px;line-height:1.7;">Expect polished cocktails, warm service, and a beautiful evening on the Protaras strip.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def build_email(
    *,
    sender: str,
    recipient: str,
    subject: str,
    text_body: str,
    html_body: str,
    reply_to: str,
) -> email.message.EmailMessage:
    message = email.message.EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = subject
    message["Reply-To"] = reply_to
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    return message


def send_reservation_emails(reservation_id: int, reservation: dict) -> dict:
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username)

    if not all([host, username, password, sender]):
        mark_notification(reservation_id, "not_sent")
        return {"sent": False, "status": "not_sent"}

    text_body = email_text_body(reservation)
    html_body = email_html_body(reservation)
    subject = "Cartel reservation request"
    messages = [
        build_email(
            sender=sender,
            recipient=reservation["email"],
            subject="Your Cartel reservation request",
            text_body=text_body,
            html_body=html_body,
            reply_to=MANAGER_EMAIL,
        ),
        build_email(
            sender=sender,
            recipient=MANAGER_EMAIL,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            reply_to=reservation["email"],
        ),
    ]

    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(username, password)
            for message in messages:
                refused = smtp.send_message(message)
                if refused:
                    raise smtplib.SMTPRecipientsRefused(refused)
        mark_notification(reservation_id, "sent")
        return {"sent": True, "status": "sent"}
    except (OSError, smtplib.SMTPException):
        mark_notification(reservation_id, "failed")
        return {"sent": False, "status": "failed"}


def send_manual_admin_email(reservation: dict) -> dict:
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username)

    if not all([host, username, password, sender]):
        return {"sent": False, "status": "not_sent"}

    notes = reservation["notes"] or "No notes added."
    text_body = "\n".join(
        [
            "Manual Cartel reservation added by admin",
            "",
            f"Name: {reservation['name']}",
            f"Phone: {reservation['phone']}",
            f"Date: {european_date(reservation['date'])}",
            f"Time: {reservation['time']}",
            f"Guests: {reservation['guests']}",
            f"Notes: {notes}",
        ]
    )
    admin_reservation = {**reservation, "email": "Admin manual entry"}
    html_body = email_html_body(admin_reservation)
    message = build_email(
        sender=sender,
        recipient=MANAGER_EMAIL,
        subject="Manual Cartel reservation added",
        text_body=text_body,
        html_body=html_body,
        reply_to=MANAGER_EMAIL,
    )

    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(username, password)
            refused = smtp.send_message(message)
            if refused:
                raise smtplib.SMTPRecipientsRefused(refused)
        return {"sent": True, "status": "sent"}
    except (OSError, smtplib.SMTPException):
        return {"sent": False, "status": "failed"}


class ReservationHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        return json.loads(raw_body.decode("utf-8"))

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def require_admin(self) -> bool:
        if is_admin_authenticated(self.headers):
            return True
        self.send_json(401, {"ok": False, "error": "Admin login required."})
        return False

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/admin/login":
            try:
                data = self.read_json()
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "Invalid request."})
                return

            password = str(data.get("password", ""))
            if not hmac.compare_digest(password, admin_password()):
                self.send_json(401, {"ok": False, "error": "Incorrect password."})
                return

            token = admin_session_token()
            self.send_json(200, {"ok": True, "token": token})
            return

        if path == "/api/admin/logout":
            body = json.dumps({"ok": True}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header(
                "Set-Cookie",
                "cartel_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
            )
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/admin/reservations/status":
            if not self.require_admin():
                return
            try:
                data = self.read_json()
                reservation_id = int(data.get("id"))
                status = clean_text(data.get("status"), 20)
                updated = update_reservation_status(reservation_id, status)
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "Invalid request."})
                return
            except (TypeError, ValueError) as error:
                self.send_json(400, {"ok": False, "error": str(error)})
                return

            if not updated:
                self.send_json(404, {"ok": False, "error": "Reservation not found."})
                return
            self.send_json(200, {"ok": True})
            return

        if path == "/api/admin/reservations/arrival":
            if not self.require_admin():
                return
            try:
                data = self.read_json()
                reservation_id = int(data.get("id"))
                arrived = bool(data.get("arrived"))
                updated = update_reservation_arrival(reservation_id, arrived)
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "Invalid request."})
                return
            except (TypeError, ValueError):
                self.send_json(400, {"ok": False, "error": "Invalid arrival update."})
                return

            if not updated:
                self.send_json(404, {"ok": False, "error": "Reservation not found."})
                return
            self.send_json(200, {"ok": True})
            return

        if path == "/api/admin/reservations/manual":
            if not self.require_admin():
                return
            try:
                data = self.read_json()
                reservation = validate_manual_reservation(data)
                reservation_id = save_reservation(
                    reservation,
                    status="confirmed",
                    notification_status="not_sent",
                    booking_source="manual",
                )
                notification = send_manual_admin_email(reservation)
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "Invalid request."})
                return
            except ValueError as error:
                self.send_json(400, {"ok": False, "error": str(error)})
                return

            self.send_json(
                201,
                {
                    "ok": True,
                    "reservation_id": reservation_id,
                    "notification": notification,
                },
            )
            return

        if path != "/api/reservations":
            self.send_json(404, {"ok": False, "error": "Not found"})
            return

        try:
            data = self.read_json()
            reservation = validate_reservation(data)
            reservation_id = save_reservation(reservation)
            notification = send_reservation_emails(reservation_id, reservation)
            reservation_status = "confirmed" if notification["status"] == "sent" else "pending"
            update_reservation_status(reservation_id, reservation_status)
        except json.JSONDecodeError:
            self.send_json(400, {"ok": False, "error": "Invalid request."})
            return
        except ValueError as error:
            self.send_json(400, {"ok": False, "error": str(error)})
            return

        self.send_json(
            201,
            {
                "ok": True,
                "reservation_id": reservation_id,
                "notification": notification,
            },
        )

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/admin":
            self.path = "/admin.html"
            return super().do_GET()

        if path == "/api/health":
            self.send_json(200, {"ok": True})
            return

        if path == "/api/admin/session":
            self.send_json(200, {"ok": True, "authenticated": is_admin_authenticated(self.headers)})
            return

        if path == "/api/admin/reservations":
            if not self.require_admin():
                return
            self.send_json(200, {"ok": True, "reservations": list_reservations()})
            return

        if path == "/api/admin/statistics":
            if not self.require_admin():
                return
            self.send_json(200, {"ok": True, "statistics": build_statistics()})
            return

        super().do_GET()


def main() -> None:
    load_env_files()
    init_db()
    port = int(os.getenv("PORT", "4173"))
    server = ThreadingHTTPServer(("127.0.0.1", port), ReservationHandler)
    print(f"Cartel reservation server running at http://127.0.0.1:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
