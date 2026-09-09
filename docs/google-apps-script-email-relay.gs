/**
 * I&C Laundry email relay for Cloudflare Workers.
 *
 * Create this script while signed in as iclaundryshop@gmail.com. The account
 * that owns the deployment is the Gmail sender. Never put the relay secret in
 * this file or in source control; save it in Script Properties instead.
 */

const SECRET_PROPERTY = 'EMAIL_RELAY_SECRET';
const SENDER_NAME = 'I&C Laundry';
const MAX_RECIPIENT_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 20000;

function doPost(event) {
  try {
    const payload = JSON.parse(event && event.postData && event.postData.contents || '{}');
    const configuredSecret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);

    if (!configuredSecret || !payload.secret || payload.secret !== configuredSecret) {
      return response({ success: false, error: 'Unauthorized' });
    }

    const to = String(payload.to || '').trim();
    const subject = String(payload.subject || '').trim();
    const body = String(payload.body || '').trim();
    const html = String(payload.html || '').trim();

    if (!isValidEmail(to) || !subject || !body ||
        to.length > MAX_RECIPIENT_LENGTH || subject.length > MAX_SUBJECT_LENGTH ||
        body.length > MAX_BODY_LENGTH || html.length > MAX_BODY_LENGTH * 3) {
      return response({ success: false, error: 'Invalid message' });
    }

    GmailApp.sendEmail(to, subject, body, {
      htmlBody: html || undefined,
      name: SENDER_NAME,
      replyTo: 'iclaundryshop@gmail.com',
    });
    return response({ success: true });
  } catch (error) {
    // Do not return provider details, recipient information, or secrets.
    console.error('Email relay failed', error && error.message);
    return response({ success: false, error: 'Delivery failed' });
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function response(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
