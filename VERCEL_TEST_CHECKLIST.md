# Vercel Test Checklist

Use this after the first Vercel deployment.

## 1. Environment Check

Open:

```text
https://your-vercel-url.vercel.app/api/health
```

Expected:

```json
{
  "ok": true,
  "supabase": true,
  "smtp": true,
  "admin": true,
  "environment": "vercel"
}
```

If `smtp` is `false`, reservations can still save, but verification and confirmation emails will not send.

## 2. Public Website

Check:

- homepage loads
- cocktail cards load from Supabase
- events load from Supabase
- Explore Cocktails opens the menu
- Reserve opens the reservation form

## 3. Customer Reservation

Use a real email address online. The local test code `000000` only works on localhost.

Check:

- verification email arrives
- verification code opens the reservation details form
- reservation request saves as pending
- success popup appears
- admin receives reservation request email if SMTP is working

## 4. Admin

Open:

```text
https://your-vercel-url.vercel.app/admin
```

Check:

- admin login works
- reservations list loads
- statistics load
- manual reservation saves
- confirming a reservation updates status
- arrived checkbox works
- events can be edited
- cocktail card text can be edited
- cocktail images can upload
- menu can upload

## 5. Supabase

Confirm new records appear in:

- `reservations`
- `email_verifications`
- `events`
- `cocktail_cards`

Confirm uploaded files appear in Supabase Storage bucket:

```text
cartel-assets
```
