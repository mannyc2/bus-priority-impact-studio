import type {
  OperationalOccurrenceMemberExtentRowV1,
  OperationalOccurrenceRowV2,
  OperationalOccurrenceTreatmentMemberV2,
} from "@bp/domain/documents/operational-occurrence";

export type StudyMemberExtentLineage = {
  readonly identityGrain: "occurrence_route_member";
  readonly sourceOccurrenceReleaseId: string;
  readonly manifestSha256: string;
  readonly projectionSha256: string;
  readonly rowCount: number;
  readonly eligibleRowCount: number;
};

export function occurrenceRouteMemberKey(input: {
  readonly occurrence_id: string;
  readonly route_record_id: string;
  readonly treatment_record_id: string;
}): string {
  return `${input.occurrence_id}\u0000${input.route_record_id}\u0000${input.treatment_record_id}`;
}

function treatmentMembers(
  occurrence: OperationalOccurrenceRowV2,
): readonly OperationalOccurrenceTreatmentMemberV2[] {
  return occurrence.treatment.kind === "atomic"
    ? [occurrence.treatment.member]
    : occurrence.treatment.members;
}

function assertSortedUnique(values: readonly string[], label: string): void {
  if (values.some((value, index) => index > 0 && value <= (values[index - 1] ?? ""))) {
    throw new Error(`${label} must be sorted and unique`);
  }
}

function validateMemberExtentRow(row: OperationalOccurrenceMemberExtentRowV1): void {
  assertSortedUnique(row.missing_roles, `${row.extent_id} missing roles`);
  assertSortedUnique(
    row.evidence_bindings.map(
      (binding) =>
        `${binding.role}\u0000${binding.record_id}\u0000${binding.source_id}\u0000${binding.evidence_id}`,
    ),
    `${row.extent_id} evidence bindings`,
  );
  for (const component of row.components) {
    assertSortedUnique(component.identifiers, `${row.extent_id} component identifiers`);
  }
  if (row.extent === "unresolved") {
    if (row.components.length !== 0 || row.missing_roles.length === 0) {
      throw new Error(
        `${row.extent_id} unresolved member extent requires no positive components and at least one missing role`,
      );
    }
    return;
  }
  if (
    row.decision_id === null ||
    row.components.length === 0 ||
    row.evidence_bindings.length === 0 ||
    row.missing_roles.length !== 0
  ) {
    throw new Error(
      `${row.extent_id} positive member extent requires a decision, components, evidence, and no missing roles`,
    );
  }
  const kinds = new Set(row.components.map((component) => component.component_kind));
  if (row.extent === "route_wide" && (row.components.length !== 1 || !kinds.has("route"))) {
    throw new Error(`${row.extent_id} route_wide member extent requires one route component`);
  }
  if (row.extent === "bounded_segment" && !kinds.has("corridor") && !kinds.has("segment")) {
    throw new Error(
      `${row.extent_id} bounded_segment member extent requires a corridor or segment component`,
    );
  }
  if (row.extent === "stop_set" && !kinds.has("stop")) {
    throw new Error(`${row.extent_id} stop_set member extent requires stop components`);
  }
  if (row.extent === "mixed" && kinds.size < 2) {
    throw new Error(`${row.extent_id} mixed member extent requires distinct component kinds`);
  }
}

/**
 * Verify the producer companion against the complete occurrence × route ×
 * treatment-member denominator. This validates member extent only; it grants
 * no onset, phase, spine, estimator, approval, or publication authority.
 */
export function validateOperationalOccurrenceMemberExtents(input: {
  readonly occurrences: readonly OperationalOccurrenceRowV2[];
  readonly rows: readonly OperationalOccurrenceMemberExtentRowV1[];
  readonly lineage: StudyMemberExtentLineage;
}): ReadonlyMap<string, OperationalOccurrenceMemberExtentRowV1> {
  if (input.lineage.identityGrain !== "occurrence_route_member") {
    throw new Error("Member-extent lineage must use occurrence_route_member grain");
  }
  if (input.rows.length !== input.lineage.rowCount) {
    throw new Error(
      `Member-extent row count mismatch: expected ${input.lineage.rowCount}, received ${input.rows.length}`,
    );
  }

  const expected = new Map<
    string,
    {
      readonly occurrence: OperationalOccurrenceRowV2;
      readonly route: OperationalOccurrenceRowV2["routes"][number];
      readonly member: OperationalOccurrenceTreatmentMemberV2;
    }
  >();
  let eligibleRowCount = 0;
  for (const occurrence of input.occurrences) {
    for (const route of occurrence.routes) {
      for (const member of treatmentMembers(occurrence)) {
        const key = occurrenceRouteMemberKey({
          occurrence_id: occurrence.occurrence_id,
          route_record_id: route.route_record_id,
          treatment_record_id: member.treatment_record_id,
        });
        if (expected.has(key))
          throw new Error(`Duplicate occurrence member denominator key ${key}`);
        expected.set(key, { occurrence, route, member });
        if (occurrence.study_projection_eligible) eligibleRowCount += 1;
      }
    }
  }
  if (eligibleRowCount !== input.lineage.eligibleRowCount) {
    throw new Error(
      `Eligible member-extent row count mismatch: expected ${input.lineage.eligibleRowCount}, received ${eligibleRowCount}`,
    );
  }
  if (expected.size !== input.rows.length) {
    throw new Error(
      `Member-extent denominator mismatch: expected ${expected.size}, received ${input.rows.length}`,
    );
  }

  const rows = new Map<string, OperationalOccurrenceMemberExtentRowV1>();
  let priorKey = "";
  const extentIds = new Set<string>();
  for (const row of input.rows) {
    validateMemberExtentRow(row);
    const key = occurrenceRouteMemberKey(row);
    if (priorKey !== "" && key <= priorKey) {
      throw new Error("Member-extent projection rows must be sorted and unique at exact grain");
    }
    priorKey = key;
    if (extentIds.has(row.extent_id)) {
      throw new Error(`Duplicate member extent id ${row.extent_id}`);
    }
    extentIds.add(row.extent_id);
    const expectedRow = expected.get(key);
    if (expectedRow === undefined) throw new Error(`Stale or unknown member extent ${key}`);
    if (
      row.occurrence_review_decision_id !== expectedRow.occurrence.occurrence_review_decision_id ||
      row.gtfs_route_id !== expectedRow.route.gtfs_route_id ||
      row.treatment_family !== expectedRow.member.treatment_family
    ) {
      throw new Error(`Member-extent lineage mismatch for ${key}`);
    }
    rows.set(key, row);
  }
  for (const key of expected.keys()) {
    if (!rows.has(key)) throw new Error(`Missing member extent ${key}`);
  }
  return rows;
}
