export interface EscapedCsv {
  /** The file to save. The service's own text, unless a cell had to change. */
  csv: string;
  /** True when a cell was escaped, so the file is no longer the service's file. */
  escaped: boolean;
}

interface CsvCell {
  /** The cell's value, with the quotes and the doubled quotes taken off. */
  value: string;
  /** Where the value starts in the source, inside the quotes when the source quoted the cell. */
  valueStart: number;
}

/**
 * The export is the data feed for the A/B analysis, so the file the organiser saves is the file
 * the service sent. A name a spreadsheet could run as a formula gets an apostrophe in front of
 * it, and nothing else in the file moves.
 */
export function escapeSpreadsheetFormulas(csv: string): EscapedCsv {
  if (!csv) return { csv: "", escaped: false };

  const insertions: number[] = [];
  for (const row of parseCsv(csv)) {
    for (const cell of row) {
      if (needsEscaping(cell.value)) insertions.push(cell.valueStart);
    }
  }

  if (insertions.length === 0) return { csv, escaped: false };

  let output = "";
  let cursor = 0;
  for (const at of insertions) {
    output += `${csv.slice(cursor, at)}'`;
    cursor = at;
  }
  output += csv.slice(cursor);
  return { csv: output, escaped: true };
}

function parseCsv(csv: string): CsvCell[][] {
  const rows: CsvCell[][] = [];
  let row: CsvCell[] = [];
  let index = 0;

  while (index < csv.length) {
    const start = index;
    const quoted = csv[index] === '"';
    let valueStart = start;
    let value = "";

    if (quoted) {
      valueStart = start + 1;
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

    row.push({ value, valueStart });

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

/**
 * Section 13 names a name a spreadsheet could run as a formula. This check is deliberately wider,
 * as the export's check was before it: it allows whitespace before the character, and catches a
 * leading tab or carriage return.
 */
function needsEscaping(value: string): boolean {
  return /^[\t\r]/.test(value) || /^\s*[=+\-@]/u.test(value);
}
