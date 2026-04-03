/**
 * Website Publisher — Webmaster Agent
 *
 * Auto-publishes obituaries and service information to kcgoldengate.com.
 * Currently generates static HTML that can be uploaded or integrated
 * with whatever CMS the website uses.
 */

import { queryOne } from '../../db/client';

export interface ObituaryPage {
  slug: string;
  title: string;
  html: string;
  meta_description: string;
  meta_keywords: string;
}

export function generateObituaryPage(
  caseData: any,
  obituaryText: string
): ObituaryPage {
  const fullName = [caseData.decedent_first_name, caseData.decedent_middle_name, caseData.decedent_last_name]
    .filter(Boolean).join(' ');

  const dob = caseData.date_of_birth ? formatDate(caseData.date_of_birth) : '';
  const dod = caseData.date_of_death ? formatDate(caseData.date_of_death) : '';

  const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const serviceInfo = caseData.service_date
    ? `<div class="service-info">
        <h3>Service Information</h3>
        <p><strong>Service:</strong> ${formatDate(caseData.service_date)}${caseData.service_time ? ` at ${caseData.service_time}` : ''}</p>
        ${caseData.service_location ? `<p><strong>Location:</strong> ${caseData.service_location}</p>` : ''}
        ${caseData.visitation_date ? `<p><strong>Visitation:</strong> ${formatDate(caseData.visitation_date)}${caseData.visitation_time ? ` at ${caseData.visitation_time}` : ''}${caseData.visitation_location ? ` at ${caseData.visitation_location}` : ''}</p>` : ''}
        ${caseData.cemetery_name ? `<p><strong>Interment:</strong> ${caseData.cemetery_name}</p>` : ''}
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullName} Obituary | KC Golden Gate Funeral Home</title>
  <meta name="description" content="Obituary for ${fullName}${dob ? `, ${dob}` : ''}${dod ? ` - ${dod}` : ''}. KC Golden Gate Funeral Home, Kansas City, Missouri.">
  <meta name="keywords" content="${fullName}, obituary, Kansas City, KC Golden Gate Funeral Home, ${caseData.residence_city || 'Missouri'}">
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
    .header { text-align: center; border-bottom: 2px solid #c9a96e; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #1a1a2e; font-size: 2em; margin-bottom: 5px; }
    .dates { color: #666; font-size: 1.1em; }
    .obituary { line-height: 1.8; font-size: 1.05em; }
    .obituary p { margin-bottom: 1em; }
    .service-info { background: #f8f6f0; padding: 20px; border-left: 4px solid #c9a96e; margin: 30px 0; }
    .service-info h3 { color: #1a1a2e; margin-top: 0; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 0.9em; }
    .guestbook { margin-top: 30px; padding: 20px; background: #fafafa; }
    .guestbook h3 { color: #1a1a2e; }
  </style>
</head>
<body>
  <article>
    <div class="header">
      <p style="color: #c9a96e; font-style: italic;">In Loving Memory of</p>
      <h1>${fullName}</h1>
      ${dob || dod ? `<p class="dates">${dob}${dob && dod ? ' — ' : ''}${dod}</p>` : ''}
    </div>

    <div class="obituary">
      ${obituaryText.split('\n\n').map(p => `<p>${p}</p>`).join('\n')}
    </div>

    ${serviceInfo}

    <div class="guestbook">
      <h3>Share a Memory</h3>
      <p>We invite you to share your favorite memories, stories, and condolences with the family.</p>
    </div>

    <div class="footer">
      <p><strong>KC Golden Gate Funeral Home</strong></p>
      <p>Kansas City, Missouri | <a href="https://kcgoldengate.com">kcgoldengate.com</a></p>
    </div>
  </article>
</body>
</html>`;

  return {
    slug,
    title: `${fullName} Obituary`,
    html,
    meta_description: `Obituary for ${fullName}${dob ? `, ${dob}` : ''}${dod ? ` - ${dod}` : ''}. KC Golden Gate Funeral Home.`,
    meta_keywords: `${fullName}, obituary, Kansas City, funeral, KC Golden Gate`,
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
