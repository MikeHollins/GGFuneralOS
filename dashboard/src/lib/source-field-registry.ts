import registry from './source-field-registry.json';

export type SourceFieldDestination = 'grid' | 'drawer' | 'source_evidence' | 'ignored';

export type SourceFieldCategory =
  | 'identity'
  | 'arrangements'
  | 'service'
  | 'death_certificate'
  | 'crematory'
  | 'cremains'
  | 'belongings'
  | 'system'
  | 'unknown';

export type SourceFieldDefinition = {
  key: string;
  label: string;
  category: SourceFieldCategory;
  destination: SourceFieldDestination;
  editable: boolean;
  notes?: string;
};

const entries = registry as SourceFieldDefinition[];
const byKey = new Map(entries.map((entry) => [entry.key, entry]));

const systemKeys = new Set([
  '_row_number',
  'case_group_key',
  'case_match_key',
  'case_match_basis',
  'case_year',
  'identity_status',
  'identity_basis',
  'cremation_number',
  'dc_number',
  'mokan_number',
]);

function genericDefinition(key: string): SourceFieldDefinition | null {
  if (/^column_\d+$/.test(key)) {
    return {
      key,
      label: `Unlabeled source ${key.replace('column_', 'col ')}`,
      category: 'unknown',
      destination: 'source_evidence',
      editable: false,
      notes: 'Unlabeled source-sheet column retained for evidence and parity review.',
    };
  }
  if (key.startsWith('to_search_')) {
    return {
      key,
      label: 'Sheet instruction text',
      category: 'system',
      destination: 'ignored',
      editable: false,
      notes: 'User-facing sheet instruction, not case data.',
    };
  }
  if (key === 'harvea2') {
    return {
      key,
      label: 'Crematory prefilled case #',
      category: 'system',
      destination: 'source_evidence',
      editable: false,
      notes: 'Unlabeled crematory-log first column; often prefilled before a deceased name exists.',
    };
  }
  return null;
}

export function sourceFieldDefinitions() {
  return entries;
}

export function sourceFieldDefinition(key: string): SourceFieldDefinition {
  const existing = byKey.get(key);
  if (existing) return existing;
  const generic = genericDefinition(key);
  if (generic) return generic;
  if (systemKeys.has(key)) {
    return {
      key,
      label: key.replace(/^_/, '').replace(/_/g, ' '),
      category: 'system',
      destination: 'source_evidence',
      editable: false,
      notes: 'Internal resolver/provenance field.',
    };
  }
  return {
    key,
    label: key.replace(/^_/, '').replace(/_/g, ' '),
    category: 'unknown',
    destination: 'source_evidence',
    editable: false,
    notes: 'Filled source field not yet classified in the parity registry.',
  };
}

export function sourceFieldLabel(key: string) {
  return sourceFieldDefinition(key).label;
}

export function unclassifiedSourceKeys(keys: Iterable<string>) {
  return Array.from(keys).filter((key) => !byKey.has(key) && !systemKeys.has(key) && !genericDefinition(key)).sort();
}
