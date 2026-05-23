# Cartel Reservation System

Run the website with the reservation server:

```bash
python3 server.py
```

Open:

```text
http://127.0.0.1:4173/
```

Reservation requests are saved in:

```text
reservations.db
```

## Brevo Email Notifications

The email hook is set up for Brevo SMTP. Edit this visible file:

```text
email-settings.env
```

Use these values:

```text
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=your-brevo-smtp-login
SMTP_PASSWORD=your-brevo-smtp-key
SMTP_FROM=your-verified-sender-email
ADMIN_PASSWORD=choose-a-private-admin-password
```

Start the server:

```bash
python3 server.py
```

Each successful reservation email is sent to the customer and to:

```text
kyriakos.10@live.com
```

If the SMTP variables are not set, reservations still save normally and the notification
status is stored as `not_sent`.

Use the SMTP login and SMTP key from Brevo, not your Brevo account password.
The `SMTP_FROM` email must be a sender verified in Brevo.

You can also use a hidden `.env` file if you prefer. If both files exist,
`email-settings.env` wins.

## Admin Dashboard

Open:

```text
http://127.0.0.1:4173/admin
```

The admin password is read from `ADMIN_PASSWORD` in `email-settings.env`.
If it is not set, the local fallback password is:

```text
cartel-admin
```
