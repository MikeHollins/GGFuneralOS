import 'dotenv/config';

const PAGE_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;

/**
 * Facebook Graph API v18.0 — Page posting.
 * Supports text posts and photo posts.
 */

export async function publishToFacebook(
  content: string,
  mediaUrls: string[] = []
): Promise<string | undefined> {
  if (!PAGE_TOKEN || !PAGE_ID) {
    console.log('[facebook] Not configured — skipping');
    return undefined;
  }

  try {
    if (mediaUrls.length > 0) {
      // Photo post — use the first image
      const res = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: mediaUrls[0],
          message: content,
          access_token: PAGE_TOKEN,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
      console.log(`[facebook] Photo post published: ${data.id}`);
      return data.id;
    }

    // Text-only post
    const res = await fetch(`https://graph.facebook.com/v18.0/${PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        access_token: PAGE_TOKEN,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
    console.log(`[facebook] Post published: ${data.id}`);
    return data.id;
  } catch (err: any) {
    console.error(`[facebook] Publish failed: ${err.message}`);
    throw err;
  }
}
