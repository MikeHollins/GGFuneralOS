import 'dotenv/config';

const API_KEY = process.env.GOOGLE_AI_API_KEY;

interface ObituaryInput {
  fullName: string;
  nickname?: string;
  dateOfBirth?: string;
  dateOfDeath?: string;
  birthplace?: string;
  residenceCity?: string;
  residenceState?: string;
  occupation?: string;
  education?: string;
  armedForces?: boolean;
  maritalStatus?: string;
  survivingSpouse?: string;
  church?: string;
  organizations?: string;
  hobbies?: string;
  survivors?: string;
  precededBy?: string;
  serviceDate?: string;
  serviceLocation?: string;
  cemeteryName?: string;
  specialMemories?: string;
}

/**
 * Generate a warm, personalized obituary using Google Gemini.
 * Falls back to null if API is unavailable.
 */
export async function generateObituaryProse(input: ObituaryInput): Promise<string | null> {
  if (!API_KEY) {
    console.log('[gemini] API key not configured — skipping AI obituary');
    return null;
  }

  const prompt = buildObituaryPrompt(input);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`[gemini] API error ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }

    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('[gemini] No text in response');
      return null;
    }

    console.log(`[gemini] Obituary generated: ${text.length} chars`);
    return text.trim();
  } catch (err: any) {
    console.error(`[gemini] Generation failed: ${err.message}`);
    return null;
  }
}

function buildObituaryPrompt(input: ObituaryInput): string {
  const facts: string[] = [];
  facts.push(`Full legal name: ${input.fullName}`);
  if (input.nickname) facts.push(`Known as: ${input.nickname}`);
  if (input.dateOfBirth) facts.push(`Date of birth: ${input.dateOfBirth}`);
  if (input.dateOfDeath) facts.push(`Date of death: ${input.dateOfDeath}`);
  if (input.birthplace) facts.push(`Birthplace: ${input.birthplace}`);
  if (input.residenceCity) facts.push(`Residence: ${input.residenceCity}, ${input.residenceState || 'MO'}`);
  if (input.occupation) facts.push(`Occupation: ${input.occupation}`);
  if (input.education) facts.push(`Education: ${input.education}`);
  if (input.armedForces) facts.push('Served in the US Armed Forces');
  if (input.maritalStatus) facts.push(`Marital status: ${input.maritalStatus}`);
  if (input.survivingSpouse) facts.push(`Surviving spouse: ${input.survivingSpouse}`);
  if (input.church) facts.push(`Church: ${input.church}`);
  if (input.organizations) facts.push(`Organizations: ${input.organizations}`);
  if (input.hobbies) facts.push(`Hobbies/interests: ${input.hobbies}`);
  if (input.survivors) facts.push(`Survived by: ${input.survivors}`);
  if (input.precededBy) facts.push(`Preceded in death by: ${input.precededBy}`);
  if (input.serviceDate) facts.push(`Service date: ${input.serviceDate}`);
  if (input.serviceLocation) facts.push(`Service location: ${input.serviceLocation}`);
  if (input.cemeteryName) facts.push(`Interment: ${input.cemeteryName}`);
  if (input.specialMemories) facts.push(`Special memories/traits: ${input.specialMemories}`);

  return `You are writing an obituary for a funeral program. Write a warm, dignified, and personalized obituary of 3-5 paragraphs based ONLY on the facts provided below. Do NOT invent or assume any details not given. If information is sparse, write a shorter but still warm obituary.

TONE: Warm and personal, like a loving tribute written by someone who knew them. Not clinical, not generic. Avoid cliches like "left this world too soon" or "leaves behind a legacy of love." Use specific details from their life to make it unique.

STRUCTURE:
1. Opening paragraph: name, birth/death dates, birthplace, residence
2. Life story: career, education, military service, accomplishments
3. What they loved: hobbies, church, organizations, personality
4. Survived by: family members (use traditional order: spouse, children, grandchildren, parents, siblings)
5. Service information and memorial donations

FACTS:
${facts.map(f => `- ${f}`).join('\n')}

Write the obituary now. Do not include a title or heading — just the body text.`;
}

/**
 * Refine an existing obituary based on feedback.
 */
export async function refineObituary(currentText: string, feedback: string): Promise<string | null> {
  if (!API_KEY) return null;

  const prompt = `Here is a current obituary draft:\n\n${currentText}\n\nThe family has this feedback: "${feedback}"\n\nPlease revise the obituary to address the feedback while maintaining the warm, dignified tone. Do not add any information not in the original or the feedback. Return only the revised obituary text.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 2000 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}
