import 'dotenv/config';

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_BUSINESS_ID = process.env.INSTAGRAM_BUSINESS_ID;

/**
 * Instagram Graph API — requires a Facebook Page connected to an IG Professional Account.
 * Two-step publish: create media container → publish container.
 */

export async function publishToInstagram(
  content: string,
  mediaUrls: string[] = []
): Promise<string | undefined> {
  if (!ACCESS_TOKEN || !IG_BUSINESS_ID) {
    console.log('[instagram] Not configured — skipping');
    return undefined;
  }

  if (mediaUrls.length === 0) {
    console.log('[instagram] Instagram requires at least one image — skipping text-only post');
    return undefined;
  }

  try {
    // Step 1: Create media container
    const createRes = await fetch(`https://graph.facebook.com/v18.0/${IG_BUSINESS_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: mediaUrls[0],
        caption: content,
        access_token: ACCESS_TOKEN,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const createData: any = await createRes.json();
    if (!createRes.ok) throw new Error(createData.error?.message || JSON.stringify(createData));
    const containerId = createData.id;

    // Step 2: Publish container
    const publishRes = await fetch(`https://graph.facebook.com/v18.0/${IG_BUSINESS_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: ACCESS_TOKEN,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const publishData: any = await publishRes.json();
    if (!publishRes.ok) throw new Error(publishData.error?.message || JSON.stringify(publishData));

    console.log(`[instagram] Post published: ${publishData.id}`);
    return publishData.id;
  } catch (err: any) {
    console.error(`[instagram] Publish failed: ${err.message}`);
    throw err;
  }
}
