import { query } from '../../db/client';

const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL || 'https://g.page/kcgoldengate/review';
const REVIEW_DELAY_DAYS = 10; // send review request 10 days after service

/**
 * Review Agent — automates Google review requests.
 *
 * Sends a personalized SMS 7-14 days post-service asking families
 * to leave a Google review. Tracks requests to prevent duplicates.
 */

export async function processReviewRequests(
  sendSms: (to: string, body: string) => Promise<void>
): Promise<number> {
  // Find cases in aftercare where service was 7-14 days ago and no review request sent
  const eligible = await query(
    `SELECT c.id as case_id, c.case_number, c.decedent_first_name, c.decedent_last_name,
            c.service_date,
            cc.id as contact_id, cc.first_name, cc.phone
     FROM cases c
     JOIN case_contacts cc ON cc.case_id = c.id AND cc.is_nok = true
     WHERE c.phase = 'AFTERCARE'
       AND c.service_date IS NOT NULL
       AND c.service_date < now() - interval '${REVIEW_DELAY_DAYS} days'
       AND c.service_date > now() - interval '30 days'
       AND cc.phone IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM review_requests rr WHERE rr.case_id = c.id
       )`
  );

  let sent = 0;

  for (const row of eligible as any[]) {
    const message =
      `Hi ${row.first_name}, this is KC Golden Gate Funeral Home. ` +
      `We were honored to serve your family for ${row.decedent_first_name}. ` +
      `If you have a moment, we would truly appreciate a review of your experience: ${GOOGLE_REVIEW_URL} ` +
      `Thank you for trusting us during this time.`;

    try {
      await sendSms(row.phone, message);

      await query(
        `INSERT INTO review_requests (case_id, contact_id, phone, review_url, message_sent, sent_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [row.case_id, row.contact_id, row.phone, GOOGLE_REVIEW_URL, message]
      );

      sent++;
      console.log(`[review-agent] Review request sent to ${row.first_name} (GG-${row.case_number})`);
    } catch (err: any) {
      console.error(`[review-agent] Failed to send to ${row.phone}: ${err.message}`);
    }
  }

  if (sent > 0) console.log(`[review-agent] ${sent} review request(s) sent`);
  return sent;
}
