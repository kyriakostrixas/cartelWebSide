import { config } from "./config.js";
import { sendEmailVerificationCode } from "./email.js";

const target = process.argv[2] || config.smtp.adminEmail;

if (!config.smtp.host || !config.smtp.username || !config.smtp.password || !config.smtp.fromEmail) {
  console.error("SMTP is not fully configured. Check SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM_EMAIL.");
  process.exit(1);
}

if (!target) {
  console.error("No recipient email found. Pass one as an argument or set ADMIN_EMAIL.");
  process.exit(1);
}

sendEmailVerificationCode(target, "123456")
  .then((result) => {
    console.log(`Email test status: ${result.status}`);
    if (result.reason) console.log(`Reason: ${result.reason}`);
  })
  .catch((error) => {
    console.error(error.message || "Email test failed.");
    process.exit(1);
  });
