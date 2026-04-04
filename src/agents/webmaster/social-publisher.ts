import { query, queryOne } from '../../db/client';
import { publishToFacebook } from '../../services/social/facebook';
import { publishToInstagram } from '../../services/social/instagram';
import { publishToTwitter } from '../../services/social/twitter';
import { publishToLinkedIn } from '../../services/social/linkedin';
import { publishToGBP } from '../../services/social/google-business';

/**
 * Social Publisher — Webmaster Agent
 *
 * Publishes posts to Facebook, Instagram, Twitter/X, LinkedIn, and Google Business.
 * All platform APIs are real implementations (gracefully skip if unconfigured).
 */

export async function publishPost(postId: string): Promise<{ success: boolean; platform_post_id?: string; error?: string }> {
  const post = await queryOne('SELECT * FROM social_posts WHERE id = $1', [postId]);
  if (!post) return { success: false, error: 'Post not found' };

  const p = post as any;

  try {
    let platformPostId: string | undefined;

    switch (p.platform) {
      case 'FACEBOOK':
        platformPostId = await publishToFacebook(p.content, p.media_urls || []);
        break;
      case 'INSTAGRAM':
        platformPostId = await publishToInstagram(p.content, p.media_urls || []);
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
 * Publish a memorial post to all platforms at once.
 */
export async function publishMemorialToAll(
  caseId: string,
  content: { facebook: string; instagram: string; twitter: string; linkedin: string },
  mediaUrls: string[] = []
): Promise<{ results: Record<string, { success: boolean; id?: string }> }> {
  const results: Record<string, { success: boolean; id?: string }> = {};
  const website = process.env.FUNERAL_HOME_WEBSITE || 'https://kcgoldengate.com';

  const platforms = [
    { platform: 'FACEBOOK', text: content.facebook, fn: publishToFacebook },
    { platform: 'INSTAGRAM', text: content.instagram, fn: publishToInstagram },
    { platform: 'TWITTER', text: content.twitter, fn: publishToTwitter },
    { platform: 'LINKEDIN', text: content.linkedin, fn: publishToLinkedIn },
  ];

  for (const { platform, text, fn } of platforms) {
    try {
      const id = await fn(text, mediaUrls);

      // Record in social_posts table
      await query(
        `INSERT INTO social_posts (case_id, platform, content, post_type, cta_url, status, published_at, platform_post_id)
         VALUES ($1, $2, $3, 'memorial', $4, 'PUBLISHED', now(), $5)`,
        [caseId, platform, text, website, id || null]
      );

      results[platform] = { success: true, id };
    } catch (err: any) {
      results[platform] = { success: false };
      console.error(`[webmaster] ${platform} failed: ${err.message}`);
    }
  }

  // Also post to Google Business Profile
  try {
    const gbpId = await publishToGBP(content.facebook.slice(0, 1500));
    results['GOOGLE_BUSINESS'] = { success: true, id: gbpId };
  } catch {
    results['GOOGLE_BUSINESS'] = { success: false };
  }

  return { results };
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
 * Run on a schedule (every 15 minutes).
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
