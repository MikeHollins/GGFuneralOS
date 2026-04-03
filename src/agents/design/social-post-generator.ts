import { queryOne } from '../../db/client';

/**
 * Social Post Generator — Design Agent
 *
 * Generates platform-specific memorial and marketing posts.
 * Always includes a CTA. Respectful but business-aware.
 */

interface PostContent {
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'TWITTER' | 'LINKEDIN';
  content: string;
  cta_text: string;
  cta_url: string;
  post_type: string;
}

export function generateMemorialPost(
  decedentName: string,
  obituarySummary: string,
  serviceDate: string | null,
  serviceLocation: string | null
): PostContent[] {
  const websiteUrl = process.env.FUNERAL_HOME_WEBSITE || 'https://kcgoldengate.com';
  const phone = process.env.FUNERAL_HOME_PHONE || '';

  const serviceInfo = serviceDate
    ? `\n\nServices will be held ${formatDate(serviceDate)}${serviceLocation ? ` at ${serviceLocation}` : ''}.`
    : '';

  // Facebook — long-form, full obituary summary
  const facebook: PostContent = {
    platform: 'FACEBOOK',
    content: `${obituarySummary}${serviceInfo}\n\nThe family and staff of KC Golden Gate Funeral Home extend our deepest condolences. We are honored to serve the ${decedentName.split(' ').pop()} family during this time.\n\nFull obituary and service details: ${websiteUrl}`,
    cta_text: 'Read Full Obituary',
    cta_url: websiteUrl,
    post_type: 'memorial',
  };

  // Instagram — shorter, visual-first
  const instagram: PostContent = {
    platform: 'INSTAGRAM',
    content: `In Loving Memory of ${decedentName}\n\n${obituarySummary.slice(0, 200)}...${serviceInfo}\n\nFull obituary at link in bio.\n\n#InLovingMemory #KCGoldenGate #KansasCity #CelebrationOfLife`,
    cta_text: 'Link in Bio',
    cta_url: websiteUrl,
    post_type: 'memorial',
  };

  // Twitter/X — concise
  const twitter: PostContent = {
    platform: 'TWITTER',
    content: `In Loving Memory of ${decedentName}. ${obituarySummary.slice(0, 180)}...\n\nFull obituary: ${websiteUrl}`,
    cta_text: 'Read More',
    cta_url: websiteUrl,
    post_type: 'memorial',
  };

  // LinkedIn — professional tone
  const linkedin: PostContent = {
    platform: 'LINKEDIN',
    content: `KC Golden Gate Funeral Home is honored to serve the family of ${decedentName}.\n\n${obituarySummary.slice(0, 300)}${serviceInfo}\n\nWe believe every life tells a story worth honoring. Learn more about our commitment to compassionate service at ${websiteUrl}.`,
    cta_text: 'Visit Our Website',
    cta_url: websiteUrl,
    post_type: 'memorial',
  };

  return [facebook, instagram, twitter, linkedin];
}

/**
 * Generate daily content posts (non-memorial, marketing/educational).
 */
export function generateDailyPost(
  dayOfWeek: number // 0=Sunday, 1=Monday, etc.
): PostContent | null {
  const websiteUrl = process.env.FUNERAL_HOME_WEBSITE || 'https://kcgoldengate.com';

  const contentByDay: Record<number, { content: string; cta_text: string; post_type: string } | null> = {
    0: null, // Sunday — no post
    1: { // Monday — Educational/Planning
      content: "Did you know? Pre-planning your funeral arrangements can save your family significant stress and financial burden during an already difficult time.\n\nAt KC Golden Gate, we offer free, no-pressure pre-planning consultations. Take the first step in giving your family peace of mind.",
      cta_text: 'Schedule a Free Consultation',
      post_type: 'pre_planning',
    },
    2: { // Tuesday — Community
      content: "Our team is proud to serve the Kansas City community. Every family we work with reminds us why this calling matters — it's about being there when it counts most.\n\nThank you, Kansas City, for trusting us with your loved ones.",
      cta_text: 'Learn About Our Team',
      post_type: 'community',
    },
    3: { // Wednesday — reserved for memorial posts
      content: "Every life has a story. Every story deserves to be honored.\n\nAt KC Golden Gate Funeral Home, we believe in creating services that truly celebrate the person — not just the occasion. From personalized programs to unique tributes, we help families create meaningful moments.",
      cta_text: 'Explore Our Services',
      post_type: 'educational',
    },
    4: { // Thursday — Behind the scenes
      content: "Behind every service is a team that cares deeply about getting every detail right — from the flowers to the music to the words on the program.\n\nWe don't just plan funerals. We help families honor legacies.",
      cta_text: 'Meet Our Team',
      post_type: 'behind_scenes',
    },
    5: { // Friday — Pre-planning
      content: "This weekend, consider having the conversation. Talking about end-of-life wishes isn't easy, but it's one of the most caring things you can do for the people you love.\n\nWe're here to help guide that conversation whenever you're ready.",
      cta_text: 'Download Our Free Planning Guide',
      post_type: 'pre_planning',
    },
    6: null, // Saturday — no post
  };

  const template = contentByDay[dayOfWeek];
  if (!template) return null;

  return {
    platform: 'FACEBOOK',
    content: template.content,
    cta_text: template.cta_text,
    cta_url: websiteUrl,
    post_type: template.post_type,
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
