import nodemailer from 'nodemailer';

// A timeout/disconnect can occur after acceptance. Never auto-retry an ambiguous
// submission: providers do not expose a shared idempotency contract.
export class UncertainDelivery extends Error {}
export async function deliverReminder(channel, recipient, message) {
  const e = process.env;
  if (channel === 'email' && !e.BREVO_API_KEY && e.SMTP_USER && e.SMTP_PASS) {
    const transport = nodemailer.createTransport({ host: e.SMTP_HOST || 'smtp-relay.brevo.com', port: Number(e.SMTP_PORT) || 587, secure: Number(e.SMTP_PORT) === 465, auth: { user: e.SMTP_USER, pass: e.SMTP_PASS }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    try {
      const result = await transport.sendMail({ from: e.BREVO_SENDER_EMAIL || e.SMTP_USER, to: recipient, subject: 'PawCare vaccination reminder', text: message });
      if (!result.accepted?.length) throw new Error('Email recipient rejected');
      return { provider: 'smtp', id: result.messageId };
    } catch (error) {
      if (error.responseCode >= 400 && error.responseCode < 500 || ['EAUTH', 'ECONNECTION'].includes(error.code)) throw new Error('Email provider rejected the request');
      throw new UncertainDelivery('Email submission could not be confirmed');
    } finally { transport.close(); }
  }
  let url, headers, body, provider;
  if (channel === 'email') {
    if (!e.BREVO_API_KEY || !e.BREVO_SENDER_EMAIL) throw new Error('Email provider is not configured');
    provider = 'brevo'; url = 'https://api.brevo.com/v3/smtp/email';
    headers = { 'api-key': e.BREVO_API_KEY };
    body = { sender: { email: e.BREVO_SENDER_EMAIL, name: 'PawCare' }, to: [{ email: recipient }], subject: 'PawCare vaccination reminder', textContent: message };
  } else {
    if (!(e.TEXTBEE_API_KEY || e.TEXTBEE_KEY) || !e.TEXTBEE_DEVICE_ID) throw new Error('TextBee is not configured');
    provider = 'textbee'; url = `https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(e.TEXTBEE_DEVICE_ID)}/send-sms`;
    headers = { 'x-api-key': e.TEXTBEE_API_KEY || e.TEXTBEE_KEY };
    body = { recipients: [recipient], message };
  }
  let response;
  try { response = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); }
  catch { throw new UncertainDelivery('Provider submission could not be confirmed'); }
  if (response.status >= 500) throw new UncertainDelivery('Provider returned an ambiguous server error');
  if (!response.ok) throw new Error(`Provider rejected reminder (${response.status})`);
  const result = await response.json().catch(() => ({}));
  return { provider, id: result.messageId || result.data?.smsId || null };
}
