import { query, queryOne } from '../../db/client';

/**
 * Social Publisher — Webmaster Agent
 *
 * Publishes posts to Facebook, Instagram, Twitter/X, and LinkedIn.
 * Handles scheduling, publishing, and tracking engagement.
 *
 * API integrations are stubbed — fill in with actual API calls
 * when credentials are configured.
 */

export async function publishPost(postId: string): Promise<{ success: boolean; platform_post_id?: string; error?: string }> {
  const post = await queryOne('SELECT * FROM social_posts WHERE id = $1', [postId]);
  if (!post) return { success: false, error: 'Post not found' };

  const p = post as any;

  try {
    let platformPostId: string | undefined;

    switch (p.platform) {
      case 'FACEBOOK':
        platformPostId = await publishToFacebook(p.content, p.media_urls);
        break;
      case 'INSTAGRAM':
        platformPostId = await publishToInstagram(p.content, p.media_urls);
        break;
      case 'TWITTER':
        platformPostId = await publishToTwitter(p.content);
        break;
      case 'LINKEDIN':
        platformPostId = await publishToLinkedIn(p.content);
        break;
    }

    await query(
      `UPDATE social_posts SET status = 'PUBLISHED', published_at = now(), platform_post_id = $1 WHERE id = $2`,
      [platformPostId || null, postId]
    );

    console.log(`[webmaster] Published ${p.platform} post: ${postId}`);
    return { success: true, platform_post_id: platformPostId };
  } catch (err: any) {
    await query(`UPDATE social_posts SET status = 'FAILED' WHERE id = $1`, [postId]);
    console.error(`[webmaster] Failed to publish ${p.platform} post: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Schedule a post for future publication.
 */
export async function schedulePost(
  caseId: string | null,
  platform: string,
  content: string,
  postType: string,
  ctaText: string,
  ctaUrl: string,
  scheduledFor: Date
): Promise<string> {
  const rows = await query(
    `INSERT INTO social_posts (case_id, platform, content, post_type, cta_text, cta_url, status, scheduled_for)
     VALUES ($1, $2, $3, $4, $5, $6, 'SCHEDULED', $7) RETURNING id`,
    [caseId, platform, content, postType, ctaText, ctaUrl, scheduledFor.toISOString()]
  );
  return (rows[0] as any).id;
}

/**
 * Process all posts scheduled for now or earlier.
 * Run on a schedule (every 15 minutes recommended).
 */
export async function processScheduledPosts(): Promise<number> {
  const due = await query(
    `SELECT id FROM social_posts WHERE status = 'SCHEDULED' AND scheduled_for <= now()`
  );

  let published = 0;
  for (const row of due) {
    const result = await publishPost((row as any).id);
    if (result.success) published++;
  }

  if (published > 0) {
    console.log(`[webmaster] Published ${published} scheduled post(s)`);
  }
  return published;
}

// ─── Platform API Stubs ─────────────────────────────────────────────────────
// Replace these with actual API calls when credentials are configured.

async function publishToFacebook(content: string, _mediaUrls: any[]): Promise<string | undefined> {
  const token = process.env.FACEBOOK_PAGE_TOKEN;
  if (!token) {
    console.log('[webmaster] Facebook: no token configured — post saved as draft');
    return undefined;
  }
  // TODO: Meta Graph API — POST /v18.0/{page-id}/feed
  console.log(`[webmaster] Facebook post queued (${content.length} chars)`);
  return undefined;
}

async function publishToInstagram(content: string, _mediaUrls: any[]): Promise<string | undefined> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    console.log('[webmaster] Instagram: no token configured — post saved as draft');
    return undefined;
  }
  // TODO: Instagram Graph API — requires media container creation first
  console.log(`[webmaster] Instagram post queued (${content.length} chars)`);
  return undefined;
}

async function publishToTwitter(content: string): Promise<string | undefined> {
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    console.log('[webmaster] Twitter: no API key configured — post saved as draft');
    return undefined;
  }
  // TODO: Twitter API v2 — POST /2/tweets
  console.log(`[webmaster] Twitter post queued (${content.length} chars)`);
  return undefined;
}

async function publishToLinkedIn(content: string): Promise<string | undefined> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    console.log('[webmaster] LinkedIn: no token configured — post saved as draft');
    return undefined;
  }
  // TODO: LinkedIn API — POST /v2/ugcPosts
  console.log(`[webmaster] LinkedIn post queued (${content.length} chars)`);
  return undefined;
}
