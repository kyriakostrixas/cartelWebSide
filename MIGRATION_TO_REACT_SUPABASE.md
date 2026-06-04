# Cartel React, Express, Supabase Migration

This is the new online-ready direction for the Cartel website.

## What We Added

- `client/` - React public website foundation.
- `server/` - Express API logic shared by local development and Vercel.
- `api/index.js` - Vercel serverless Express entry point.
- `supabase/schema.sql` - PostgreSQL tables for Supabase.
- `vercel.json` - Vercel build and routing config.
- `package.json` - Node, React, Express, Vite, and Supabase dependencies.

The old Python/SQLite site is still present so the current working website is not lost while we migrate.

## Supabase Setup

1. Open Supabase.
2. Create or open your project.
3. Go to `SQL Editor`.
4. Paste everything from `supabase/schema.sql`.
5. Run the SQL.
6. Go to `Project Settings > API`.
7. Copy:
   - `Project URL`
   - `service_role key`

Keep the service role key private. Do not put it in public frontend code.

## Local Environment

Create a local `.env` file using `.env.example` as the guide:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=your-brevo-smtp-login
SMTP_PASSWORD=your-brevo-smtp-key
SMTP_FROM_EMAIL=your-verified-sender-email
SMTP_FROM_NAME=Cartel Cocktail Bar
ADMIN_EMAIL=kyriakos.10@live.com
ADMIN_PASSWORD=your-admin-password
ADMIN_SESSION_SECRET=long-random-secret
```

## Vercel Environment Variables

In Vercel, add the same variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

For `ADMIN_SESSION_SECRET`, use a long random text value.

## Local Commands

Install dependencies:

```bash
npm install
```

Run the React frontend:

```bash
npm run dev
```

Run the Express API locally:

```bash
npm run dev:api
```

The React frontend runs at `http://127.0.0.1:5173`.
The new Express API runs at `http://127.0.0.1:5174`.
The old Python server may still run at `http://127.0.0.1:4173` while we migrate, mostly for old-site testing and local image paths.

## Migration Status

Completed in the React/Supabase version:

- React public homepage.
- React reservation flow with email verification.
- Local-only test code `000000` for reservation form testing.
- React admin login.
- React reservations dashboard.
- Manual reservations.
- Reservation status and arrival controls.
- Admin statistics.
- Editable events section.
- Editable cocktail cards.
- Supabase Storage uploads for cocktail images.
- Supabase Storage upload for the public menu.
- Public menu viewer.
- Supabase PostgreSQL data migration from the old SQLite database.
- Vercel routing config.

Next steps:

- Configure production SMTP, preferably Brevo.
- Add environment variables in Vercel.
- Deploy to a Vercel test URL.
- Test customer reservation, admin confirmation, uploads, and menu viewer online.
- After the Vercel version is confirmed, archive or remove the old Python/SQLite files.
