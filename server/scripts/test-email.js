import dotenv from "dotenv";
import { sendMail } from "../services.js";

dotenv.config();

const targetEmail = process.argv[2] || process.env.SMTP_USER || "ybanezynajane15@gmail.com";

console.log("==========================================");
console.log("       PawCare Email Delivery Test        ");
console.log("==========================================");
console.log(`Sending test email to: ${targetEmail}`);
console.log(`SMTP Host: ${process.env.SMTP_HOST}`);
console.log(`SMTP Port: ${process.env.SMTP_PORT}`);
console.log(`SMTP User: ${process.env.SMTP_USER}`);
console.log(`Sender:    ${process.env.SMTP_FROM || "PawCare Clinic"}\n`);

async function run() {
  try {
    const result = await sendMail(
      targetEmail,
      "🐾 PawCare Email Test - Brevo Verification",
      `Hello!\n\nThis is a test email sent from PawCare Veterinary Clinic via Brevo.\nTime: ${new Date().toLocaleString()}\n\nIf you see this, your email configuration is working perfectly!`,
      `<div style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 500px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">🐾 PawCare Email Delivery Verified</h2>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Hello! This test confirms that your PawCare clinic email service is successfully connected to <b>Brevo</b>.
        </p>
        <div style="background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13px; color: #475569; margin: 16px 0;">
          <b>Timestamp:</b> ${new Date().toLocaleString()}<br>
          <b>Delivery Method:</b> Real Brevo Relay
        </div>
        <p style="color: #64748b; font-size: 12px;">Warm regards,<br>PawCare Veterinary Clinic System</p>
      </div>`
    );

    console.log("\n==========================================");
    if (result.via === "smtp" || result.via === "brevo_api") {
      console.log(`✅ SUCCESS! Email sent via ${result.via.toUpperCase()} to ${targetEmail}`);
      console.log("Please check your email inbox (and spam/promotions folder).");
    } else {
      console.log(`ℹ️ Email delivered to LOCAL DEV OUTBOX (via: ${result.via})`);
      console.log("SMTP was not reached or credentials were not accepted by the relay.");
    }
    console.log("==========================================\n");
  } catch (err) {
    console.error("\n❌ Delivery failed with error:", err);
  }
}

run();

