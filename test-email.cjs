// Quick test script — run: node test-email.js your-email@gmail.com
require("dotenv").config();
const nodemailer = require("nodemailer");

const GMAIL_EMAIL = process.env.GMAIL_EMAIL;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const testTo = process.argv[2];
if (!testTo) {
  console.error("Usage: node test-email.js <recipient-email>");
  process.exit(1);
}

async function main() {
  if (!GMAIL_EMAIL || !GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_EMAIL and GMAIL_APP_PASSWORD must be configured in .env");
  }
  console.log(`Sending test email to: ${testTo}`);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_EMAIL, pass: GMAIL_APP_PASSWORD },
  });

  // Test 1: Order Received email
  const etaMinutes = 15 + 45 + 35 + 40 + 15; // 150 min = 2h 30m
  const completionTime = new Date(Date.now() + etaMinutes * 60000);
  const completionText = completionTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const body = `Hi Test Customer,\n\nThank you for choosing H&C Laundry! Your garment has been received and is now being processed.\n\nOrder Details:\n• Order Number: HC-TEST-0001\n• Service: Regular Wash\n• Weight: 8 kg\n• Total: ₱215\n\nEstimated Completion Time: 2 hours 30 minutes (approximately ${completionText})\n\nWe'll notify you via email once your laundry is ready for pickup.\n\nThank you!\n\n— H&C Laundry Team`;

  const lines = body
    .split("\n")
    .map((l) => (l ? `<p style="margin:0 0 8px">${l}</p>` : "<br/>"))
    .join("");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #f9fafb; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="margin: 0; color: #111827; font-size: 20px;">🧺 H&C Laundry</h2>
      </div>
      <div style="background: #fff; border-radius: 10px; padding: 24px; border: 1px solid #e5e7eb;">
        <h3 style="margin: 0 0 16px; color: #111827; font-size: 16px;">Order Received! (Order #HC-TEST-0001)</h3>
        <div style="color: #374151; font-size: 14px; line-height: 1.6;">${lines}</div>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>This is an automated notification from H&C Laundry Management System</p>
      </div>
    </div>`;

  try {
    const info = await transporter.sendMail({
      from: `"H&C Laundry" <${GMAIL_EMAIL}>`,
      replyTo: GMAIL_EMAIL,
      to: testTo,
      subject: "Order Received! (Order #HC-TEST-0001)",
      text: body,
      html,
    });
    console.log("✅ Email sent successfully!");
    console.log("Message ID:", info.messageId);
  } catch (err) {
    console.error("❌ Failed to send email:", err.message);
  }
}

main();
