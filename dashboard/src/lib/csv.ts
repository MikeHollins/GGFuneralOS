export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((values) => values.some(Boolean));
}

export function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function rowsToObjects(rows: string[][]) {
  const headerRowIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === 'deceased'));
  if (headerRowIndex < 0) return [];

  const headers = rows[headerRowIndex].map(normalizeHeader);
  return rows.slice(headerRowIndex + 1).map((row, rowIndex) => {
    const record: Record<string, string> = { _row_number: String(headerRowIndex + rowIndex + 2) };
    headers.forEach((header, index) => {
      if (header) record[header] = row[index] ?? '';
    });
    return record;
  });
}
