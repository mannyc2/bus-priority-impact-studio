export function parseCsvLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      output.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  output.push(current);
  return output;
}

export function rowFromCsvValues<T extends Record<string, string>>(
  headers: readonly string[],
  values: readonly string[],
): T {
  const output: Record<string, string> = {};
  headers.forEach((header, index) => {
    output[header] = values[index] ?? "";
  });
  return output as T;
}

export type CsvRecord = {
  headers: readonly string[];
  values: readonly string[];
  lineNumber: number;
};

export async function* readCsvRecords(path: string): AsyncGenerator<CsvRecord> {
  const decoder = new TextDecoder();
  let buffered = "";
  let headers: string[] | null = null;
  let lineNumber = 0;

  for await (const chunk of Bun.file(path).stream()) {
    buffered += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffered.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex).replace(/\r$/, "");
      buffered = buffered.slice(newlineIndex + 1);
      lineNumber += 1;
      if (line.trim().length > 0) {
        if (headers === null) headers = parseCsvLine(line);
        else yield { headers, values: parseCsvLine(line), lineNumber };
      }
      newlineIndex = buffered.indexOf("\n");
    }
  }

  buffered += decoder.decode();
  const line = buffered.replace(/\r$/, "");
  if (line.trim().length > 0) {
    lineNumber += 1;
    if (headers === null) headers = parseCsvLine(line);
    else yield { headers, values: parseCsvLine(line), lineNumber };
  }
}

export async function* readCsvRows<T extends Record<string, string>>(
  path: string,
): AsyncGenerator<T> {
  for await (const record of readCsvRecords(path)) {
    yield rowFromCsvValues<T>(record.headers, record.values);
  }
}
