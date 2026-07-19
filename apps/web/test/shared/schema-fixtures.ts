import { decodeStrict } from "@bp/domain/decode";
import { IsoMonthSchema } from "@bp/domain/primitives";

export function isoMonthFixture(value: string) {
  return decodeStrict(IsoMonthSchema)(value);
}
