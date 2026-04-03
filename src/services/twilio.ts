import 'dotenv/config';

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

export async function sendSms(to: string, body: string): Promise<string | null> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
    console.log(`[twilio] Not configured — would send to ${to}: ${body.slice(0, 50)}...`);
    return null;
  }

  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: TWILIO_PHONE, Body: body.slice(0, 1600) });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const json: any = await res.json();
  if (!res.ok) throw new Error(`Twilio error: ${json.message || JSON.stringify(json)}`);

  console.log(`[twilio] SMS sent to ${to} — SID: ${json.sid}`);
  return json.sid;
}
