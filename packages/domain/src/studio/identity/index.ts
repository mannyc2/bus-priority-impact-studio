import * as z from "zod";

// Public identity + magic-link auth contracts (ADR 0008) and the user-surface
// features it unlocks: operator admin, alerts, saved searches, public comments.
// Shapes mirror the D1 query records in @bp/db (identity.ts, identity-surfaces.ts,
// studio-auth.ts) without importing them — the domain package stays infra-free.

export const StudioActorScopeSchema = z.enum([
  "read:briefs",
  "write:briefs",
  "review:briefs",
  "publish:briefs",
  "admin:identities",
]);
export type StudioActorScope = z.output<typeof StudioActorScopeSchema>;

export const PublicAccountAuthStatusSchema = z.enum(["magic_link", "not_available"]);
export type PublicAccountAuthStatus = z.output<typeof PublicAccountAuthStatusSchema>;

export const UserDirectoryStatusSchema = z.enum(["d1_identity", "not_available"]);
export type UserDirectoryStatus = z.output<typeof UserDirectoryStatusSchema>;

// --- Identity / session ---

export const IdentityProfileSchema = z
  .object({
    identityId: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
  })
  .strict();
export type IdentityProfile = z.output<typeof IdentityProfileSchema>;

export const StudioActorProfileSchema = z
  .object({
    workspaceId: z.string(),
    scopes: z.array(StudioActorScopeSchema),
  })
  .strict();
export type StudioActorProfile = z.output<typeof StudioActorProfileSchema>;

export const IdentityMeResponseSchema = z
  .object({
    identity: IdentityProfileSchema,
    operator: StudioActorProfileSchema.nullable(),
  })
  .strict();
export type IdentityMeResponse = z.output<typeof IdentityMeResponseSchema>;

export const IdentityAnonymousMeResponseSchema = z
  .object({
    identity: z.null(),
    operator: z.null(),
  })
  .strict();
export type IdentityAnonymousMeResponse = z.output<typeof IdentityAnonymousMeResponseSchema>;

// Operator-facing /api/v1/studio/me. Unchanged for operators (ADR 0008); the two
// status fields are now real enums rather than "not_available" literals.
export const StudioActorMeResponseSchema = z
  .object({
    publicAccountAuthStatus: PublicAccountAuthStatusSchema,
    userDirectoryStatus: UserDirectoryStatusSchema,
    operator: StudioActorProfileSchema.nullable(),
  })
  .strict();
export type StudioActorMeResponse = z.output<typeof StudioActorMeResponseSchema>;

export const MagicLinkRequestSchema = z
  .object({ email: z.string().email(), next: z.string().optional() })
  .strict();
export type MagicLinkRequest = z.output<typeof MagicLinkRequestSchema>;

export const MagicLinkConsumeRequestSchema = z.object({ token: z.string().min(1) }).strict();
export type MagicLinkConsumeRequest = z.output<typeof MagicLinkConsumeRequestSchema>;

// --- Operator admin (manage identities + roles) ---

export const AdminIdentityEntrySchema = z
  .object({
    identityId: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    operator: StudioActorProfileSchema.nullable(),
  })
  .strict();
export type AdminIdentityEntry = z.output<typeof AdminIdentityEntrySchema>;

export const AdminIdentitiesListResponseSchema = z
  .object({ identities: z.array(AdminIdentityEntrySchema) })
  .strict();
export type AdminIdentitiesListResponse = z.output<typeof AdminIdentitiesListResponseSchema>;

export const AdminGrantOperatorRequestSchema = z
  .object({
    workspaceId: z.string(),
    scopes: z.array(StudioActorScopeSchema),
  })
  .strict();
export type AdminGrantOperatorRequest = z.output<typeof AdminGrantOperatorRequestSchema>;

export const AdminRevokeOperatorRequestSchema = z.object({ workspaceId: z.string() }).strict();
export type AdminRevokeOperatorRequest = z.output<typeof AdminRevokeOperatorRequestSchema>;

// --- Alerts ---

export const AlertKindSchema = z.enum(["route", "segment", "search"]);
export type AlertKind = z.output<typeof AlertKindSchema>;

export const AlertCreateRequestSchema = z
  .object({
    kind: AlertKindSchema,
    payload: z.unknown(),
  })
  .strict();
export type AlertCreateRequest = z.output<typeof AlertCreateRequestSchema>;

export const AlertResponseSchema = z
  .object({
    alertId: z.string(),
    kind: AlertKindSchema,
    payload: z.unknown(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type AlertResponse = z.output<typeof AlertResponseSchema>;

export const AlertsListResponseSchema = z.object({ alerts: z.array(AlertResponseSchema) }).strict();
export type AlertsListResponse = z.output<typeof AlertsListResponseSchema>;

// --- Saved searches ---

export const SavedSearchCreateRequestSchema = z
  .object({
    label: z.string(),
    query: z.unknown(),
  })
  .strict();
export type SavedSearchCreateRequest = z.output<typeof SavedSearchCreateRequestSchema>;

export const SavedSearchResponseSchema = z
  .object({
    savedSearchId: z.string(),
    label: z.string(),
    query: z.unknown(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type SavedSearchResponse = z.output<typeof SavedSearchResponseSchema>;

export const SavedSearchesListResponseSchema = z
  .object({ savedSearches: z.array(SavedSearchResponseSchema) })
  .strict();
export type SavedSearchesListResponse = z.output<typeof SavedSearchesListResponseSchema>;

// --- Public comments on briefs ---

export const PublicCommentCreateRequestSchema = z.object({ body: z.string() }).strict();
export type PublicCommentCreateRequest = z.output<typeof PublicCommentCreateRequestSchema>;

export const PublicCommentResponseSchema = z
  .object({
    commentId: z.string(),
    briefId: z.string(),
    displayName: z.string().nullable(),
    body: z.string(),
    createdAt: z.string(),
  })
  .strict();
export type PublicCommentResponse = z.output<typeof PublicCommentResponseSchema>;

export const PublicCommentsListResponseSchema = z
  .object({ comments: z.array(PublicCommentResponseSchema) })
  .strict();
export type PublicCommentsListResponse = z.output<typeof PublicCommentsListResponseSchema>;
