export function writeJson(path: string, data: unknown): Promise<number> {
  return Bun.write(path, `${JSON.stringify(data, null, 2)}\n`);
}
