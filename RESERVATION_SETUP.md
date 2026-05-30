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

## Brevo Delivery And Bounce Alerts

The website keeps the admin panel simple: once the admin confirms a reservation
and Brevo accepts the confirmation email, the admin panel shows the email status
as sent.

If Brevo later reports that the customer email bounced or was blocked, the app
sends a private warning email to the admin with the reservation details and asks
the admin to call the customer by phone. To make those real Brevo delivery events
work after the website is deployed, configure a Brevo transactional webhook to
call this public URL:

```text
https://your-domain.com/api/email/brevo-webhook
```

Enable hard bounce, soft bounce, invalid email, blocked, error, spam, and
complaint events. Localhost cannot receive real Brevo webhook events, so this
part only works automatically when the site has a public domain.

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
