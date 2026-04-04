import 'dotenv/config';

const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'info@kcgoldengate.com';
const FUNERAL_HOME = process.env.FUNERAL_HOME_NAME || 'KC Golden Gate Funeral Home';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function send(opts: EmailOptions): Promise<boolean> {
  if (!SENDGRID_KEY) {
    console.log(`[email] Not configured — would send to ${opts.to}: ${opts.subject}`);
    return false;
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to }] }],
      from: { email: FROM_EMAIL, name: FUNERAL_HOME },
      subject: opts.subject,
      content: [
        ...(opts.text ? [{ type: 'text/plain', value: opts.text }] : []),
        { type: 'text/html', value: opts.html },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[email] SendGrid error ${res.status}: ${err}`);
    return false;
  }

  console.log(`[email] Sent to ${opts.to}: ${opts.subject}`);
  return true;
}

// ─── Pre-built Templates ────────────────────────────────────────────────────

export async function sendArrangementConfirmation(
  toEmail: string, contactName: string, decedentName: string, date: string, time: string
): Promise<boolean> {
  return send({
    to: toEmail,
    subject: `Arrangement Conference Confirmation — ${decedentName}`,
    html: `
      <p>Dear ${contactName},</p>
      <p>This confirms your arrangement conference for <strong>${decedentName}</strong> on <strong>${date}</strong> at <strong>${time}</strong> at ${FUNERAL_HOME}.</p>
      <p>Please bring the following if available:</p>
      <ul>
        <li>Social Security card or number</li>
        <li>Military discharge papers (DD-214) if applicable</li>
        <li>Life insurance policies</li>
        <li>Clothing for the deceased</li>
        <li>A recent photograph</li>
        <li>Names and contact info for 6-8 pallbearers</li>
      </ul>
      <p>If you have any questions, please call us at any time.</p>
      <p>Respectfully,<br>${FUNERAL_HOME}</p>
    `,
  });
}

export async function sendObituaryApproval(
  toEmail: string, contactName: string, decedentName: string, portalUrl: string
): Promise<boolean> {
  return send({
    to: toEmail,
    subject: `Obituary Draft for Review — ${decedentName}`,
    html: `
      <p>Dear ${contactName},</p>
      <p>We have prepared an obituary draft for <strong>${decedentName}</strong> for your review.</p>
      <p>Please review it at your convenience and let us know if you'd like any changes:</p>
      <p><a href="${portalUrl}" style="background:#c9a96e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Review Obituary</a></p>
      <p>There is no rush — take the time you need.</p>
      <p>Respectfully,<br>${FUNERAL_HOME}</p>
    `,
  });
}

export async function sendPaymentReceipt(
  toEmail: string, contactName: string, decedentName: string, amount: string, receiptUrl: string
): Promise<boolean> {
  return send({
    to: toEmail,
    subject: `Payment Received — ${decedentName}`,
    html: `
      <p>Dear ${contactName},</p>
      <p>We have received your payment of <strong>${amount}</strong> for the services of <strong>${decedentName}</strong>.</p>
      ${receiptUrl ? `<p><a href="${receiptUrl}">View Receipt</a></p>` : ''}
      <p>Thank you for your trust in ${FUNERAL_HOME}.</p>
      <p>Respectfully,<br>${FUNERAL_HOME}</p>
    `,
  });
}

export async function sendAftercareTouchpoint(
  toEmail: string, contactName: string, decedentName: string, message: string
): Promise<boolean> {
  return send({
    to: toEmail,
    subject: `A Note from ${FUNERAL_HOME}`,
    html: `
      <p>Dear ${contactName},</p>
      <p>${message}</p>
      <p>We are always here if you need anything.</p>
      <p>With care,<br>${FUNERAL_HOME}</p>
    `,
  });
}

export async function sendGeneric(to: string, subject: string, html: string): Promise<boolean> {
  return send({ to, subject, html });
}
