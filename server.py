#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import email.message
import cgi
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import sqlite3
import smtplib
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "reservations.db"
COCKTAILS_CONFIG_PATH = ROOT / "assets" / "cartel" / "cocktails.json"
COCKTAIL_UPLOAD_DIR = ROOT / "assets" / "cartel" / "uploads"
MANAGER_EMAIL = "kyriakos.10@live.com"
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VALID_RESERVATION_STATUSES = {"pending", "confirmed", "cancelled"}
ALLOWED_RESERVATION_TIMES = {
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
    "20:30",
    "21:00",
    "21:30",
    "22:00",
}
DEFAULT_COCKTAILS = [
    {
        "image": "assets/cartel/ecobar.jpg",
        "alt": "Cartel cocktail being poured at the bar",
        "eyebrow": "Signature Pour",
        "title": "Escobar serve",
    },
    {
        "image": "assets/cartel/muchroom.jpeg",
        "alt": "Cartel mushroom cocktail with rosemary garnish",
        "eyebrow": "Forest Ritual",
        "title": "Mushroom cocktail",
    },
    {
        "image": "assets/cartel/doctor.jpg",
        "alt": "Cartel doctor cocktail served with a drip presentation",
        "eyebrow": "Doctor's Order",
        "title": "Drip therapy serve",
    },
]
EMAIL_VERIFICATION_CODES: dict[str, dict] = {}


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


def cocktail_items() -> list[dict]:
    if COCKTAILS_CONFIG_PATH.exists():
        try:
            data = json.loads(COCKTAILS_CONFIG_PATH.read_text(encoding="utf-8"))
            items = data.get("cocktails", data)
        except (json.JSONDecodeError, OSError):
            items = DEFAULT_COCKTAILS
    else:
        items = DEFAULT_COCKTAILS

    normalized = []
    for index, default in enumerate(DEFAULT_COCKTAILS):
        item = items[index] if isinstance(items, list) and index < len(items) else {}
        normalized.append(
            {
                "image": clean_text(item.get("image") or default["image"], 240),
                "alt": clean_text(item.get("alt") or default["alt"], 180),
                "eyebrow": clean_text(item.get("eyebrow") or default["eyebrow"], 80),
                "title": clean_text(item.get("title") or default["title"], 120),
            }
        )
    return normalized


def save_cocktail_items(items: list[dict]) -> None:
    COCKTAILS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    COCKTAILS_CONFIG_PATH.write_text(
        json.dumps({"cocktails": items}, indent=2) + "\n",
        encoding="utf-8",
    )


def uploaded_cocktail_path(file_item, index: int) -> str | None:
    if not getattr(file_item, "filename", ""):
        return None

    source_name = Path(file_item.filename).name
    extension = Path(source_name).suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise ValueError("Please upload JPG, PNG, or WebP images only.")

    COCKTAIL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"cocktail-{index + 1}-{dt.datetime.now().strftime('%Y%m%d%H%M%S')}{extension}"
    target = COCKTAIL_UPLOAD_DIR / filename
    data = file_item.file.read()
    if not data:
        return None
    if len(data) > 8 * 1024 * 1024:
        raise ValueError("Please upload images smaller than 8MB.")
    target.write_bytes(data)
    return f"assets/cartel/uploads/{filename}"


def normalize_phone(value: str) -> str:
    return re.sub(r"\D+", "", value)


def validate_reservation_time(value: str) -> None:
    if value not in ALLOWED_RESERVATION_TIMES:
        raise ValueError("Please choose a reservation time from 18:00 to 22:00.")


def ensure_phone_is_available(phone: str, reservation_date: str) -> None:
    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        return

    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT phone
            FROM reservations
            WHERE reservation_date = ?
              AND status != 'cancelled'
            """,
            (reservation_date,),
        ).fetchall()

    if any(normalize_phone(row["phone"]) == normalized_phone for row in rows):
        raise ValueError("This phone number already has a reservation for this date.")


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
    email_issue = email_precheck_issue(reservation["email"])
    if email_issue:
        raise ValueError(f"Please check your email address. {email_issue}")
    if not reservation["date"]:
        raise ValueError("Please choose a date.")
    if not reservation["time"]:
        raise ValueError("Please choose a time.")
    validate_reservation_time(reservation["time"])
    if reservation["guests"] < 1:
        raise ValueError("Please enter at least 1 guest.")

    return reservation


COMMON_EMAIL_DOMAIN_FIXES = {
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
}


def email_precheck_issue(email_address: str) -> str | None:
    if "@" not in email_address:
        return "Email format is invalid."

    domain = email_address.rsplit("@", 1)[1].lower()
    if domain in COMMON_EMAIL_DOMAIN_FIXES:
        return f"Email domain looks misspelled. Did the customer mean {COMMON_EMAIL_DOMAIN_FIXES[domain]}?"

    try:
        socket.getaddrinfo(domain, None)
    except socket.gaierror:
        return "Email domain could not be found before sending."
    except OSError:
        return None

    return None


def issue_email_verification_code(email_address: str) -> str:
    email_address = clean_text(email_address, 160).lower()
    if not EMAIL_PATTERN.match(email_address):
        raise ValueError("Please enter a valid email address.")
    email_issue = email_precheck_issue(email_address)
    if email_issue:
        raise ValueError(f"Please check your email address. {email_issue}")

    code = f"{secrets.randbelow(900000) + 100000}"
    EMAIL_VERIFICATION_CODES[email_address] = {
        "code": code,
        "expires_at": dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=10),
    }
    return code


def verify_email_code(email_address: str, code: str) -> bool:
    email_address = clean_text(email_address, 160).lower()
    code = clean_text(code, 12)
    record = EMAIL_VERIFICATION_CODES.get(email_address)
    if not record:
        return False
    if dt.datetime.now(dt.timezone.utc) > record["expires_at"]:
        EMAIL_VERIFICATION_CODES.pop(email_address, None)
        return False
    if not hmac.compare_digest(record["code"], code):
        return False
    return True


def consume_email_code(email_address: str) -> None:
    EMAIL_VERIFICATION_CODES.pop(clean_text(email_address, 160).lower(), None)


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
            WHERE notification_status IN ('not_sent', 'not_configured')
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


def get_reservation(reservation_id: int) -> dict | None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            """
            SELECT
                id, name, phone, email, reservation_date, reservation_time, guests,
                notes, status, notification_status, arrived, arrival_previous_status,
                booking_source, created_at
            FROM reservations
            WHERE id = ?
            """,
            (reservation_id,),
        ).fetchone()

    if row is None:
        return None

    item = dict(row)
    item["date"] = item["reservation_date"]
    item["time"] = item["reservation_time"]
    item["display_date"] = european_date(item["reservation_date"])
    item["arrived"] = bool(item["arrived"])
    return item


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


def mark_latest_email_event(email_address: str, event: str) -> dict | None:
    normalized_event = re.sub(r"[^a-z]", "", event.lower())
    delivery_events = {"delivered"}
    failure_events = {
        "hardbounce",
        "softbounce",
        "invalid",
        "blocked",
        "error",
        "spam",
        "complaint",
    }
    if normalized_event not in delivery_events | failure_events:
        return None

    email_address = clean_text(email_address, 160).lower()
    if not email_address:
        return None

    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            """
            SELECT id
            FROM reservations
            WHERE lower(email) = ?
              AND notification_status = 'sent'
              AND booking_source != 'manual'
            ORDER BY reservation_date DESC, reservation_time DESC, id DESC
            LIMIT 1
            """,
            (email_address,),
        ).fetchone()
        if row is None:
            return None
        reservation_id = int(row["id"])

    reservation = get_reservation(reservation_id)
    if reservation and normalized_event in failure_events:
        reservation["admin_notification"] = send_admin_confirmation_failure_email(reservation, event)
    return reservation


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


def email_text_body(
    reservation: dict,
    *,
    title: str = "Cartel reservation request received",
    closing_title: str = "Your night at Cartel is waiting.",
    closing_text: str = "Expect polished cocktails, warm service, and a beautiful evening on the Protaras strip.",
) -> str:
    notes = reservation["notes"] or "No notes added."
    return "\n".join(
        [
            title,
            "",
            f"Name: {reservation['name']}",
            f"Phone: {reservation['phone']}",
            f"Email: {reservation['email']}",
            f"Date: {european_date(reservation['date'])}",
            f"Time: {reservation['time']}",
            f"Guests: {reservation['guests']}",
            f"Notes: {notes}",
            "",
            f"{closing_title} {closing_text}",
        ]
    )


def email_html_body(
    reservation: dict,
    *,
    heading: str = "Cartel reservation",
    intro: str = "Your reservation request has been received with the details below.",
    closing_title: str = "Your night at Cartel is waiting.",
    closing_text: str = "Expect polished cocktails, warm service, and a beautiful evening on the Protaras strip.",
) -> str:
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
                <h1 style="margin:18px 0 0;color:#ead8b2;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1;font-weight:500;">{html.escape(heading)}</h1>
                <p style="margin:18px 0 0;color:rgba(247,239,224,0.72);font-size:16px;line-height:1.7;">{html.escape(intro)}</p>
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
                <p style="margin:0;color:#ead8b2;font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25;">{html.escape(closing_title)}</p>
                <p style="margin:12px 0 0;color:rgba(247,239,224,0.72);font-size:16px;line-height:1.7;">{html.escape(closing_text)}</p>
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


def send_admin_reservation_email(reservation: dict) -> dict:
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username)

    if not all([host, username, password, sender]):
        return {"sent": False, "status": "not_sent"}

    text_body = email_text_body(reservation)
    html_body = email_html_body(reservation)
    message = build_email(
        sender=sender,
        recipient=MANAGER_EMAIL,
        subject="Cartel reservation request",
        text_body=text_body,
        html_body=html_body,
        reply_to=reservation["email"],
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


def send_customer_confirmation_email(reservation_id: int, reservation: dict) -> dict:
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username)

    if not all([host, username, password, sender]):
        mark_notification(reservation_id, "not_sent")
        return {"sent": False, "status": "not_sent"}

    text_body = email_text_body(
        reservation,
        title="Your Cartel reservation is confirmed",
        closing_title="Your table is confirmed. The night is yours.",
        closing_text="We are looking forward to welcoming you for signature cocktails, attentive service, and an unforgettable evening on the Protaras strip.",
    )
    html_body = email_html_body(
        reservation,
        heading="Reservation confirmed",
        intro="Your Cartel reservation has been confirmed. Your table is ready with the details below.",
        closing_title="Your table is confirmed. The night is yours.",
        closing_text="We are looking forward to welcoming you for signature cocktails, attentive service, and an unforgettable evening on the Protaras strip.",
    )
    message = build_email(
        sender=sender,
        recipient=reservation["email"],
        subject="Your Cartel reservation is confirmed",
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
        mark_notification(reservation_id, "sent")
        return {"sent": True, "status": "sent"}
    except (OSError, smtplib.SMTPException):
        mark_notification(reservation_id, "sent")
        send_admin_confirmation_failure_email(reservation, "SMTP send failure")
        return {"sent": True, "status": "sent"}


def send_email_verification_code(email_address: str, code: str) -> dict:
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username)

    if not all([host, username, password, sender]):
        return {"sent": False, "status": "not_sent"}

    text_body = "\n".join(
        [
            "Cartel email verification",
            "",
            f"Your reservation code is: {code}",
            "",
            "Enter this code on the Cartel reservation form to continue.",
        ]
    )
    html_body = f"""<!doctype html>
<html>
  <body style="margin:0;background:#070706;color:#f7efe0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070706;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid rgba(205,161,90,0.32);background:#11100d;">
            <tr>
              <td style="padding:34px;border-bottom:1px solid rgba(205,161,90,0.2);background:linear-gradient(135deg,#17120b,#070706);">
                <div style="color:#cda15a;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Cartel Reservations</div>
                <h1 style="margin:18px 0 0;color:#ead8b2;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1;font-weight:500;">Verify your email</h1>
                <p style="margin:18px 0 0;color:rgba(247,239,224,0.72);font-size:16px;line-height:1.7;">Enter this code on the reservation form to continue.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:34px;">
                <div style="display:inline-block;border:1px solid rgba(205,161,90,0.42);padding:18px 26px;color:#ead8b2;font-size:34px;font-weight:800;letter-spacing:8px;">{html.escape(code)}</div>
                <p style="margin:22px 0 0;color:rgba(247,239,224,0.7);font-size:15px;line-height:1.6;">This code expires in 10 minutes.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    message = build_email(
        sender=sender,
        recipient=email_address,
        subject="Your Cartel reservation code",
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


def send_admin_confirmation_failure_email(reservation: dict, reason: str = "Email delivery failed") -> dict:
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", username)

    if not all([host, username, password, sender]):
        return {"sent": False, "status": "not_sent"}

    notes = reservation.get("notes") or "No notes added."
    reservation_for_admin = {
        **reservation,
        "date": reservation.get("date") or reservation.get("reservation_date", ""),
        "time": reservation.get("time") or reservation.get("reservation_time", ""),
        "notes": f"{notes}\nEmail issue: {reason}",
    }
    text_body = "\n".join(
        [
            "Cartel confirmation email could not be delivered",
            "",
            "The reservation is confirmed, but the customer may not have received the confirmation email.",
            "Please call the customer and personally confirm the booking.",
            "",
            f"Name: {reservation_for_admin['name']}",
            f"Phone: {reservation_for_admin['phone']}",
            f"Email: {reservation_for_admin['email']}",
            f"Date: {european_date(reservation_for_admin['date'])}",
            f"Time: {reservation_for_admin['time']}",
            f"Guests: {reservation_for_admin['guests']}",
            f"Notes: {notes}",
            f"Email issue: {reason}",
        ]
    )
    html_body = email_html_body(
        reservation_for_admin,
        heading="Action needed",
        intro="The reservation is confirmed, but the customer confirmation email could not be delivered. Please call the guest and personally confirm the table.",
        closing_title="A personal call will protect the night.",
        closing_text="Use the phone number above to let the customer know their Cartel reservation is confirmed and that an excellent evening is waiting for them.",
    )
    message = build_email(
        sender=sender,
        recipient=MANAGER_EMAIL,
        subject="Cartel action needed: confirmation email failed",
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

        if path == "/api/email/brevo-webhook":
            try:
                data = self.read_json()
                event = clean_text(
                    data.get("event")
                    or data.get("event_name")
                    or data.get("eventType")
                    or data.get("msg_status"),
                    60,
                )
                email_address = clean_text(data.get("email") or data.get("recipient"), 160)
                reservation = mark_latest_email_event(email_address, event)
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "Invalid request."})
                return

            self.send_json(200, {"ok": True, "reservation": reservation})
            return

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
                reservation = get_reservation(reservation_id)
                if reservation is None:
                    self.send_json(404, {"ok": False, "error": "Reservation not found."})
                    return
                notification = None
                if (
                    status == "confirmed"
                    and reservation["booking_source"] != "manual"
                    and reservation["notification_status"] not in {"sent", "delivered"}
                ):
                    notification = send_customer_confirmation_email(reservation_id, reservation)
                    updated = update_reservation_status(reservation_id, status)
                else:
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
            self.send_json(
                200,
                {
                    "ok": True,
                    "notification": notification,
                    "reservation": get_reservation(reservation_id),
                },
            )
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
                ensure_phone_is_available(reservation["phone"], reservation["date"])
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

        if path == "/api/admin/cocktails":
            if not self.require_admin():
                return
            try:
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={
                        "REQUEST_METHOD": "POST",
                        "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                    },
                    keep_blank_values=True,
                )
                items = cocktail_items()
                for index, item in enumerate(items):
                    item["eyebrow"] = clean_text(
                        form.getfirst(f"eyebrow_{index}", item["eyebrow"]),
                        80,
                    )
                    item["title"] = clean_text(
                        form.getfirst(f"title_{index}", item["title"]),
                        120,
                    )
                    upload = form[f"image_{index}"] if f"image_{index}" in form else None
                    if upload is not None:
                        uploaded_path = uploaded_cocktail_path(upload, index)
                        if uploaded_path:
                            item["image"] = uploaded_path
                            item["alt"] = f"Cartel cocktail image {index + 1}"
                save_cocktail_items(items)
            except ValueError as error:
                self.send_json(400, {"ok": False, "error": str(error)})
                return

            self.send_json(200, {"ok": True, "cocktails": items})
            return

        if path == "/api/email-verification":
            try:
                data = self.read_json()
                email_address = clean_text(data.get("email"), 160).lower()
                code = issue_email_verification_code(email_address)
                notification = send_email_verification_code(email_address, code)
                if notification["status"] != "sent":
                    self.send_json(
                        400,
                        {
                            "ok": False,
                            "error": "We could not send a verification code to that email. Please check it and try again.",
                            "notification": notification,
                        },
                    )
                    return
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "Invalid request."})
                return
            except ValueError as error:
                self.send_json(400, {"ok": False, "error": str(error)})
                return

            self.send_json(200, {"ok": True, "notification": notification})
            return

        if path == "/api/email-verification/check":
            try:
                data = self.read_json()
                email_address = clean_text(data.get("email"), 160).lower()
                code = clean_text(data.get("code"), 12)
                if not verify_email_code(email_address, code):
                    raise ValueError("The verification code is not correct or has expired.")
            except json.JSONDecodeError:
                self.send_json(400, {"ok": False, "error": "Invalid request."})
                return
            except ValueError as error:
                self.send_json(400, {"ok": False, "error": str(error)})
                return

            self.send_json(200, {"ok": True})
            return

        if path != "/api/reservations":
            self.send_json(404, {"ok": False, "error": "Not found"})
            return

        try:
            data = self.read_json()
            reservation = validate_reservation(data)
            if not verify_email_code(reservation["email"], data.get("email_code")):
                raise ValueError("Please enter the verification code sent to your email.")
            ensure_phone_is_available(reservation["phone"], reservation["date"])
            reservation_id = save_reservation(
                reservation,
                status="pending",
                notification_status="not_sent",
            )
            consume_email_code(reservation["email"])
            notification = send_admin_reservation_email(reservation)
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

        if path == "/api/site/cocktails":
            self.send_json(200, {"ok": True, "cocktails": cocktail_items()})
            return

        if path == "/api/admin/cocktails":
            if not self.require_admin():
                return
            self.send_json(200, {"ok": True, "cocktails": cocktail_items()})
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
