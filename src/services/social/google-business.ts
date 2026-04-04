import 'dotenv/config';

const ACCESS_TOKEN = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
const LOCATION_ID = process.env.GOOGLE_BUSINESS_LOCATION_ID;

/**
 * Google Business Profile API — auto-post obituaries and updates.
 * Also generates the direct review URL for review automation.
 */

export async function publishToGBP(content: string): Promise<string | undefined> {
  if (!ACCESS_TOKEN || !ACCOUNT_ID || !LOCATION_ID) {
    console.log('[google-business] Not configured — skipping');
    return undefined;
  }

  try {
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/accounts/${ACCOUNT_ID}/locations/${LOCATION_ID}/localPosts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          languageCode: 'en',
          summary: content.slice(0, 1500), // GBP limit
          topicType: 'STANDARD',
          callToAction: {
            actionType: 'LEARN_MORE',
            url: process.env.FUNERAL_HOME_WEBSITE || 'https://kcgoldengate.com',
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));

    console.log(`[google-business] Post published: ${data.name}`);
    return data.name;
  } catch (err: any) {
    console.error(`[google-business] Publish failed: ${err.message}`);
    throw err;
  }
}

/**
 * Get the Google review URL for this business.
 * Format: https://search.google.com/local/writereview?placeid={PLACE_ID}
 */
export function getGoogleReviewUrl(): string {
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (placeId) return `https://search.google.com/local/writereview?placeid=${placeId}`;
  return process.env.GOOGLE_REVIEW_URL || 'https://g.page/kcgoldengate/review';
}
