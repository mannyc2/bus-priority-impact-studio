import { Schema } from "effect";

// Public identity + magic-link auth contracts (ADR 0008) and the user-surface
// features it unlocks: operator admin, alerts, saved searches, public comments.
// Shapes mirror the D1 query records in @bp/db (identity.ts, identity-surfaces.ts,
// studio-auth.ts) without importing them — the domain package stays infra-free.

export const StudioActorScopeSchema = Schema.Literals([
  "read:briefs",
  "write:briefs",
  "review:briefs",
  "publish:briefs",
  "admin:identities",
]);
export type StudioActorScope = typeof StudioActorScopeSchema.Type;

export const PublicAccountAuthStatusSchema = Schema.Literals(["magic_link", "not_available"]);
export type PublicAccountAuthStatus = typeof PublicAccountAuthStatusSchema.Type;

export const UserDirectoryStatusSchema = Schema.Literals(["d1_identity", "not_available"]);
export type UserDirectoryStatus = typeof UserDirectoryStatusSchema.Type;

// --- Identity / session ---

export const IdentityProfileSchema = Schema.Struct({
  identityId: Schema.String,
  email: Schema.String,
  displayName: Schema.NullOr(Schema.String),
});
export type IdentityProfile = typeof IdentityProfileSchema.Type;

export const StudioActorProfileSchema = Schema.Struct({
  workspaceId: Schema.String,
  scopes: Schema.Array(StudioActorScopeSchema),
});
export type StudioActorProfile = typeof StudioActorProfileSchema.Type;

export const IdentityMeResponseSchema = Schema.Struct({
  identity: IdentityProfileSchema,
  operator: Schema.NullOr(StudioActorProfileSchema),
});
export type IdentityMeResponse = typeof IdentityMeResponseSchema.Type;

export const IdentityAnonymousMeResponseSchema = Schema.Struct({
  identity: Schema.Null,
  operator: Schema.Null,
});
export type IdentityAnonymousMeResponse = typeof IdentityAnonymousMeResponseSchema.Type;

// Operator-facing /api/v1/studio/me. Unchanged for operators (ADR 0008); the two
// status fields are now real enums rather than "not_available" literals.
export const StudioActorMeResponseSchema = Schema.Struct({
  publicAccountAuthStatus: PublicAccountAuthStatusSchema,
  userDirectoryStatus: UserDirectoryStatusSchema,
  operator: Schema.NullOr(StudioActorProfileSchema),
});
export type StudioActorMeResponse = typeof StudioActorMeResponseSchema.Type;

export const MagicLinkRequestSchema = Schema.Struct({
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  next: Schema.optional(Schema.String),
});
export type MagicLinkRequest = typeof MagicLinkRequestSchema.Type;

export const MagicLinkConsumeRequestSchema = Schema.Struct({
  token: Schema.String.check(Schema.isMinLength(1)),
});
export type MagicLinkConsumeRequest = typeof MagicLinkConsumeRequestSchema.Type;

// --- Operator admin (manage identities + roles) ---

export const AdminIdentityEntrySchema = Schema.Struct({
  identityId: Schema.String,
  email: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  operator: Schema.NullOr(StudioActorProfileSchema),
});
export type AdminIdentityEntry = typeof AdminIdentityEntrySchema.Type;

export const AdminIdentitiesListResponseSchema = Schema.Struct({
  identities: Schema.Array(AdminIdentityEntrySchema),
});
export type AdminIdentitiesListResponse = typeof AdminIdentitiesListResponseSchema.Type;

export const AdminGrantOperatorRequestSchema = Schema.Struct({
  workspaceId: Schema.String,
  scopes: Schema.Array(StudioActorScopeSchema),
});
export type AdminGrantOperatorRequest = typeof AdminGrantOperatorRequestSchema.Type;

export const AdminRevokeOperatorRequestSchema = Schema.Struct({
  workspaceId: Schema.String,
});
export type AdminRevokeOperatorRequest = typeof AdminRevokeOperatorRequestSchema.Type;

// --- Alerts ---

export const AlertKindSchema = Schema.Literals(["route", "segment", "search"]);
export type AlertKind = typeof AlertKindSchema.Type;

export const AlertCreateRequestSchema = Schema.Struct({
  kind: AlertKindSchema,
  payload: Schema.Unknown,
});
export type AlertCreateRequest = typeof AlertCreateRequestSchema.Type;

export const AlertResponseSchema = Schema.Struct({
  alertId: Schema.String,
  kind: AlertKindSchema,
  payload: Schema.Unknown,
  active: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type AlertResponse = typeof AlertResponseSchema.Type;

export const AlertsListResponseSchema = Schema.Struct({
  alerts: Schema.Array(AlertResponseSchema),
});
export type AlertsListResponse = typeof AlertsListResponseSchema.Type;

// --- Saved searches ---

export const SavedSearchCreateRequestSchema = Schema.Struct({
  label: Schema.String,
  query: Schema.Unknown,
});
export type SavedSearchCreateRequest = typeof SavedSearchCreateRequestSchema.Type;

export const SavedSearchResponseSchema = Schema.Struct({
  savedSearchId: Schema.String,
  label: Schema.String,
  query: Schema.Unknown,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type SavedSearchResponse = typeof SavedSearchResponseSchema.Type;

export const SavedSearchesListResponseSchema = Schema.Struct({
  savedSearches: Schema.Array(SavedSearchResponseSchema),
});
export type SavedSearchesListResponse = typeof SavedSearchesListResponseSchema.Type;

// --- Public comments on briefs ---

export const PublicCommentCreateRequestSchema = Schema.Struct({
  body: Schema.String,
});
export type PublicCommentCreateRequest = typeof PublicCommentCreateRequestSchema.Type;

export const PublicCommentResponseSchema = Schema.Struct({
  commentId: Schema.String,
  briefId: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  body: Schema.String,
  createdAt: Schema.String,
});
export type PublicCommentResponse = typeof PublicCommentResponseSchema.Type;

export const PublicCommentsListResponseSchema = Schema.Struct({
  comments: Schema.Array(PublicCommentResponseSchema),
});
export type PublicCommentsListResponse = typeof PublicCommentsListResponseSchema.Type;
