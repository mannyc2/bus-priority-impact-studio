import { type FindingEvidenceLink, FindingEvidenceLinkSchema } from "@bp/domain/findings";
import { decodeSchemaStrict } from "../schema-decode.js";

export type EvidenceRefPayload = string | Record<string, unknown>;

export type BuildEvidenceLinkInput = {
  linkId: string;
  candidateId: string;
  evidenceKind: string;
  evidenceRole: string;
  evidenceRef: EvidenceRefPayload;
  evidenceWeight: number | null;
  note: string | null;
};

function serializeEvidenceRef(ref: EvidenceRefPayload): string {
  return typeof ref === "string" ? ref : JSON.stringify(ref);
}

export function buildEvidenceLink(input: BuildEvidenceLinkInput): FindingEvidenceLink {
  return decodeSchemaStrict(FindingEvidenceLinkSchema, {
    linkId: input.linkId,
    candidateId: input.candidateId,
    evidenceKind: input.evidenceKind,
    evidenceRole: input.evidenceRole,
    evidenceRef: serializeEvidenceRef(input.evidenceRef),
    evidenceWeight: input.evidenceWeight,
    note: input.note,
  });
}
