export interface EscapedCsv {
  /** The file to save. The service's own text, unless a cell had to change. */
  csv: string;
  /** True when a cell was changed, so the file is no longer the service's file. */
  rewritten: boolean;
}

interface CsvCell {
  /** The cell's value, with the quotes and the doubled quotes taken off. */
  value: string;
  /** Where the cell starts in the source. */
  start: number;
  /** True when the source quoted the cell. */
  quoted: boolean;
}

/**
 * The export is the data feed for the A/B analysis, so the file the organiser saves is the file
 * the service sent. A name a spreadsheet could run as a formula gets an apostrophe in front of
 * it, and nothing else in the file moves.
 */
export function escapeSpreadsheetFormulas(csv: string): EscapedCsv {
  if (!csv) return { csv: "", rewritten: false };

  const insertions: number[] = [];
  for (const row of parseCsv(csv)) {
    for (const cell of row) {
      if (!needsEscaping(cell.value)) continue;
      // A quoted cell keeps its quotes, so the apostrophe goes inside them.
      insertions.push(cell.quoted ? cell.start + 1 : cell.start);
    }
  }

  if (insertions.length === 0) return { csv, rewritten: false };

  let escaped = "";
  let cursor = 0;
  for (const at of insertions) {
    escaped += `${csv.slice(cursor, at)}'`;
    cursor = at;
  }
  escaped += csv.slice(cursor);
  return { csv: escaped, rewritten: true };
}

function parseCsv(csv: string): CsvCell[][] {
  const rows: CsvCell[][] = [];
  let row: CsvCell[] = [];
  let index = 0;

  while (index < csv.length) {
    const start = index;
    const quoted = csv[index] === '"';
    let value = "";

    if (quoted) {
      index += 1;
      while (index < csv.length) {
        const character = csv[index];
        if (character === '"') {
          if (csv[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        value += character;
        index += 1;
      }
    } else {
      while (index < csv.length) {
        const character = csv[index];
        if (character === undefined || ",\r\n".includes(character)) break;
        value += character;
        index += 1;
      }
    }

    row.push({ value, start, quoted });

    if (index >= csv.length) {
      rows.push(row);
      row = [];
      break;
    }
    if (csv[index] === ",") {
      index += 1;
      continue;
    }
    // The row ends at the line break, and the break itself stays in the source.
    if (csv[index] === "\r" && csv[index + 1] === "\n") index += 1;
    index += 1;
    rows.push(row);
    row = [];
  }

  if (row.length > 0) rows.push(row);
  return rows;
}

function needsEscaping(value: string): boolean {
  return /^[\t\r]/.test(value) || /^\s*[=+\-@]/u.test(value);
}
