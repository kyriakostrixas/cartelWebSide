import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: "email-settings.env", override: true });

export const config = {
  port: Number(process.env.PORT || 5174),
  adminPassword: process.env.ADMIN_PASSWORD || "admin",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || "change-this-secret",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  smtp: {
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.SMTP_PORT || 587),
    username: process.env.SMTP_USERNAME || "",
    password: process.env.SMTP_PASSWORD || "",
    fromEmail: process.env.SMTP_FROM_EMAIL || "",
    fromName: process.env.SMTP_FROM_NAME || "Cartel Cocktail Bar",
    adminEmail: process.env.ADMIN_EMAIL || "kyriakos.10@live.com",
  },
};
