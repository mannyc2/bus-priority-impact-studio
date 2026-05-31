import { createHash } from "node:crypto";

const STABLE_ID_DELIMITER = "\u001f";
const STABLE_ID_HEX_LENGTH = 32;

export function stableId(...parts: string[]): string {
  return createHash("sha256")
    .update(parts.join(STABLE_ID_DELIMITER))
    .digest("hex")
    .slice(0, STABLE_ID_HEX_LENGTH);
}
