import { ProgramTemplate, CaseData } from './template-base';

// Import all templates
import { classicElegant } from './templates/classic-elegant';
import { homegoingGlory } from './templates/homegoing-glory';
import { militaryVeterans } from './templates/military-veterans';
import { watercolorFloral } from './templates/watercolor-floral';
import { modernMinimalist } from './templates/modern-minimalist';
import { celebrationOfLife } from './templates/celebration-of-life';
import { natureLandscape } from './templates/nature-landscape';
import { religiousFaith } from './templates/religious-faith';
import { photoCollage } from './templates/photo-collage';
import { childInfant } from './templates/child-infant';
import { hispanicGuadalupe } from './templates/hispanic-guadalupe';
import { jewishShalom } from './templates/jewish-shalom';
import { polynesian } from './templates/polynesian';
import { southernTraditional } from './templates/southern-traditional';
import { nonDenominational } from './templates/non-denominational-sunrise';

/**
 * Template Registry — central catalog of all program templates.
 */

const TEMPLATES: ProgramTemplate[] = [
  classicElegant,
  homegoingGlory,
  militaryVeterans,
  watercolorFloral,
  modernMinimalist,
  celebrationOfLife,
  natureLandscape,
  religiousFaith,
  photoCollage,
  childInfant,
  hispanicGuadalupe,
  jewishShalom,
  polynesian,
  southernTraditional,
  nonDenominational,
];

const templateMap = new Map(TEMPLATES.map(t => [t.id, t]));

export function getTemplate(id: string): ProgramTemplate | undefined {
  return templateMap.get(id);
}

export function listTemplates(): { id: string; name: string; pageCount: number; description: string; culturalContext: string[] }[] {
  return TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    pageCount: t.pageCount,
    description: t.description,
    culturalContext: t.culturalContext,
  }));
}

/**
 * Auto-suggest the best template based on case metadata.
 */
export function suggestTemplate(caseData: CaseData): ProgramTemplate {
  // Military veterans
  if (caseData.armed_forces) return militaryVeterans;

  // Cultural context hints from special_requests or other fields
  const notes = (caseData.special_requests || '').toLowerCase();

  if (/homegoing|african|baptist|ame|cogic|black church/i.test(notes)) return homegoingGlory;
  if (/hispanic|latino|latina|spanish|guadalupe|catholic.*spanish|nuestra/i.test(notes)) return hispanicGuadalupe;
  if (/jewish|shiva|kaddish|rabbi|synagogue|temple/i.test(notes)) return jewishShalom;
  if (/polynesian|hawaiian|samoan|pacific|island|aloha/i.test(notes)) return polynesian;
  if (/celebration of life|celebrate|party|upbeat/i.test(notes)) return celebrationOfLife;
  if (/child|infant|baby|stillborn|angel|little|young/i.test(notes)) return childInfant;
  if (/nature|outdoor|mountain|ocean|garden|forest|tree/i.test(notes)) return natureLandscape;
  if (/modern|minimal|simple|clean|contemporary/i.test(notes)) return modernMinimalist;
  if (/southern|dixie|country|oak|magnolia/i.test(notes)) return southernTraditional;
  if (/church|faith|christian|scripture|psalm|bible|prayer/i.test(notes)) return religiousFaith;

  // Default based on disposition
  if (caseData.disposition_type === 'CREMATION') return modernMinimalist;

  return classicElegant;
}
