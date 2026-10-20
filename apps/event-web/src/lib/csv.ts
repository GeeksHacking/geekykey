export function sanitizeSpreadsheetCsv(csv: string): string {
  if (!csv) return "";

  const rows = parseCsv(csv);
  const newline = csv.includes("\r\n") ? "\r\n" : "\n";
  const sanitized = rows
    .map((row) => row.map((cell) => escapeCsvCell(protectSpreadsheetFormula(cell))).join(","))
    .join(newline);

  return /\r\n$|\r$|\n$/.test(csv) ? `${sanitized}${newline}` : sanitized;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function protectSpreadsheetFormula(value: string): string {
  if (/^[\t\r]/.test(value) || /^\s*[=+\-@]/u.test(value)) return `'${value}`;
  return value;
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
