/**
 * SEO Optimizer — Webmaster Agent
 *
 * Generates SEO-optimized metadata for obituary pages.
 * Obituaries are high-search-volume pages that drive organic first calls.
 */

export interface SEOData {
  title: string;
  meta_description: string;
  og_title: string;
  og_description: string;
  structured_data: object; // JSON-LD
}

export function generateSEO(
  fullName: string,
  dob: string | null,
  dod: string | null,
  city: string,
  state: string,
  funeralHomeName: string
): SEOData {
  const dateRange = dob && dod ? `${formatYear(dob)}-${formatYear(dod)}` : '';

  return {
    title: `${fullName} Obituary${dateRange ? ` (${dateRange})` : ''} | ${funeralHomeName}`,
    meta_description: `Read the obituary of ${fullName}${dob ? `, born ${formatDate(dob)}` : ''}${dod ? `, who passed away ${formatDate(dod)}` : ''} in ${city}, ${state}. ${funeralHomeName}.`,
    og_title: `In Loving Memory of ${fullName}`,
    og_description: `Obituary and service information for ${fullName}. ${funeralHomeName}, ${city}, ${state}.`,
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': `Obituary: ${fullName}`,
      'author': {
        '@type': 'Organization',
        'name': funeralHomeName,
      },
      'publisher': {
        '@type': 'Organization',
        'name': funeralHomeName,
        'url': process.env.FUNERAL_HOME_WEBSITE || '',
      },
      'about': {
        '@type': 'Person',
        'name': fullName,
        ...(dob ? { 'birthDate': dob } : {}),
        ...(dod ? { 'deathDate': dod } : {}),
      },
    },
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatYear(dateStr: string): string {
  return new Date(dateStr).getFullYear().toString();
}
