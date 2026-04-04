import 'dotenv/config';

const ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const ORG_ID = process.env.LINKEDIN_ORG_ID;

/**
 * LinkedIn Marketing API — company page posting.
 * Requires Marketing Developer Platform access.
 */

export async function publishToLinkedIn(content: string): Promise<string | undefined> {
  if (!ACCESS_TOKEN || !ORG_ID) {
    console.log('[linkedin] Not configured — skipping');
    return undefined;
  }

  try {
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: `urn:li:organization:${ORG_ID}`,
        commentary: content,
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 201) {
      const postId = res.headers.get('x-restli-id') || 'posted';
      console.log(`[linkedin] Post published: ${postId}`);
      return postId;
    }

    const data: any = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  } catch (err: any) {
    console.error(`[linkedin] Publish failed: ${err.message}`);
    throw err;
  }
}
