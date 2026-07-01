import { Schema } from "effect";

export class LocalDbOpenError extends Schema.TaggedErrorClass<LocalDbOpenError>()(
  "LocalDbOpenError",
  {
    path: Schema.String,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class RouteBuildPlanCommandError extends Schema.TaggedErrorClass<RouteBuildPlanCommandError>()(
  "RouteBuildPlanCommandError",
  {
    year: Schema.Number,
    month: Schema.Number,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class RouteLocalDbCommandError extends Schema.TaggedErrorClass<RouteLocalDbCommandError>()(
  "RouteLocalDbCommandError",
  {
    command: Schema.String,
    year: Schema.Number,
    month: Schema.Number,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class BuildLocalDbCommandError extends Schema.TaggedErrorClass<BuildLocalDbCommandError>()(
  "BuildLocalDbCommandError",
  {
    command: Schema.String,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class PipelineLocalDbCommandError extends Schema.TaggedErrorClass<PipelineLocalDbCommandError>()(
  "PipelineLocalDbCommandError",
  {
    command: Schema.String,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class D1ReplayCommandError extends Schema.TaggedErrorClass<D1ReplayCommandError>()(
  "D1ReplayCommandError",
  {
    command: Schema.String,
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class PipelineFileSystemError extends Schema.TaggedErrorClass<PipelineFileSystemError>()(
  "PipelineFileSystemError",
  {
    command: Schema.String,
    operation: Schema.String,
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {}
