import { Router, Request, Response } from 'express';
import { handleIncomingSms } from '../../agents/intake/intake-agent';
import { sendSms } from '../../services/twilio';
import * as crypto from 'crypto';

export const smsWebhookRouter = Router();

/**
 * Twilio SMS Webhook — receives inbound text messages from families.
 * Validates Twilio request signature, routes to intake agent.
 *
 * Configure in Twilio console:
 * Phone Number → Messaging → Webhook URL → POST https://your-server.com/api/sms/incoming
 */
smsWebhookRouter.post('/incoming', async (req: Request, res: Response) => {
  try {
    // Validate Twilio signature (production only)
    if (process.env.TWILIO_AUTH_TOKEN && req.headers['x-twilio-signature']) {
      const valid = validateTwilioSignature(req);
      if (!valid) {
        console.warn('[sms-webhook] Invalid Twilio signature — rejecting');
        return res.status(403).send('Forbidden');
      }
    }

    const from = req.body.From;
    const body = req.body.Body || '';
    const numMedia = parseInt(req.body.NumMedia || '0', 10);

    console.log(`[sms-webhook] Inbound from ${from}: "${body.slice(0, 50)}"${numMedia > 0 ? ` + ${numMedia} media` : ''}`);

    // Handle media attachments (MMS)
    if (numMedia > 0) {
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = req.body[`MediaUrl${i}`];
        const mediaType = req.body[`MediaContentType${i}`];
        if (mediaUrl) {
          console.log(`[sms-webhook] Media ${i}: ${mediaType} → ${mediaUrl}`);
          // Download and store media
          try {
            const mediaRes = await fetch(mediaUrl, {
              headers: {
                Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
              },
            });
            if (mediaRes.ok) {
              const buffer = Buffer.from(await mediaRes.arrayBuffer());
              const { saveUploadedFile } = await import('../../services/uploads');
              // Will need the case_id from the intake session — handled inside handleIncomingSms
              console.log(`[sms-webhook] Downloaded media: ${buffer.length} bytes`);
            }
          } catch (err: any) {
            console.error(`[sms-webhook] Media download failed: ${err.message}`);
          }
        }
      }
    }

    // Route to intake agent
    const handled = await handleIncomingSms(from, body, async (to, msg) => { await sendSms(to, msg); });

    if (!handled) {
      console.log(`[sms-webhook] No active intake session for ${from} — message not processed`);
    }

    // Respond with empty TwiML (agent sends follow-up as separate message)
    res.type('text/xml').send('<Response></Response>');
  } catch (err: any) {
    console.error(`[sms-webhook] Error: ${err.message}`);
    res.type('text/xml').send('<Response></Response>');
  }
});

/**
 * Validate Twilio webhook signature.
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 */
function validateTwilioSignature(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true; // skip validation if no token

  const signature = req.headers['x-twilio-signature'] as string;
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  // Sort params alphabetically, concatenate key+value
  const params = req.body || {};
  const sortedKeys = Object.keys(params).sort();
  let dataString = url;
  for (const key of sortedKeys) {
    dataString += key + params[key];
  }

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(dataString)
    .digest('base64');

  return signature === expected;
}
