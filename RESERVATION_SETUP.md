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

To confirm reservations only after Brevo reports that the customer received
the confirmation email, configure a Brevo transactional webhook to call this URL
after the website is deployed:

```text
https://your-domain.com/api/email/brevo-webhook
```

Enable delivered, hard bounce, soft bounce, invalid email, blocked, error, spam,
and complaint events. When Brevo reports delivered, the admin panel will mark
the reservation as confirmed. When Brevo reports a failure, the admin panel will
mark the email status as failed/bounced and show a popup with the customer name
and phone number while the admin page is open.

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
