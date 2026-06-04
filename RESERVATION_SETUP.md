# Cartel Reservation System

The current version uses React, Express, Supabase PostgreSQL, Supabase Storage, and SMTP email.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the API:

```bash
npm run dev:api
```

Start the React site in a second terminal:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Admin:

```text
http://127.0.0.1:5173/admin
```

## Environment

Create `.env` from `.env.example` and add:

```text
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=your-brevo-smtp-login
SMTP_PASSWORD=your-brevo-smtp-key
SMTP_FROM_EMAIL=your-verified-sender-email
SMTP_FROM_NAME=Cartel Cocktail Bar
ADMIN_EMAIL=kyriakos.10@live.com
ADMIN_PASSWORD=choose-a-private-admin-password
ADMIN_SESSION_SECRET=choose-a-long-random-private-secret
```

For local layout testing, the verification code `000000` works only on `localhost` / `127.0.0.1`.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL Editor.

Data stored in Supabase:

- reservations
- email verification codes
- events
- cocktail cards

Files stored in Supabase Storage:

- editable cocktail card images
- uploaded menu PDF/image

## Email

Use Brevo SMTP for production. Gmail can fail unless app passwords are configured correctly.

In Brevo, use the transactional SMTP values:

```text
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=your-brevo-smtp-login
SMTP_PASSWORD=your-brevo-smtp-key
SMTP_FROM_EMAIL=your-verified-brevo-sender-email
SMTP_FROM_NAME=Cartel Cocktail Bar
ADMIN_EMAIL=kyriakos.10@live.com
```

`SMTP_FROM_EMAIL` must be a sender verified inside Brevo. It is usually not the same as the SMTP login.

For local testing you can put these values in `email-settings.env`. That file overrides SMTP values from `.env`.

After editing the values, test email:

```bash
npm run test:email -- your-email@example.com
```

If SMTP fails, reservations still save as pending. The admin dashboard will show email status as `not sent` where appropriate.

## Deploying To Vercel

Add the same `.env` values in Vercel Project Settings > Environment Variables.

Then Vercel can run:

```bash
npm run build
```

The API routes are handled by `api/index.js`.
