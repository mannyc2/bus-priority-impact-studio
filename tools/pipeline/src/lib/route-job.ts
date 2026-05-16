import {
  type CliOption,
  dbOption,
  monthOption,
  parseCliOptions,
  routeOption,
  yearOption,
} from "./cli-args.js";
import { isoMonth } from "./dates.js";
import { defaultLocalPipelineDbPath } from "./local-db.js";
import { fromCliPath } from "./paths.js";

export type RouteMonthDbArgs = {
  routeId?: string;
  year?: number;
  month?: number;
  dbPath?: string;
};

export type MonthDbArgs = {
  year?: number;
  month?: number;
  dbPath?: string;
};

export type MonthRangeDbArgs = {
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  dbPath?: string;
};

export type DbArgs = {
  dbPath?: string;
};

export type RequiredRouteMonthDbArgs = {
  routeId: string;
  year: number;
  month: number;
  dbPath: string;
};

export type RouteMonthContext = RequiredRouteMonthDbArgs & {
  isoMonth: string;
};

export type RequiredMonthDbArgs = {
  year: number;
  month: number;
  dbPath: string;
};

export type MonthContext = RequiredMonthDbArgs & {
  isoMonth: string;
};

export type RequiredMonthRangeDbArgs = {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  dbPath: string;
};

export type MonthRangeContext = RequiredMonthRangeDbArgs & {
  startIsoMonth: string;
  endIsoMonth: string;
};

export type RequiredDbArgs = {
  dbPath: string;
};

export type RouteArtifactContext = Pick<RouteMonthContext, "routeId" | "isoMonth">;

export function requireRouteMonthDbArgs(args: RouteMonthDbArgs): RequiredRouteMonthDbArgs {
  if (args.routeId === undefined) {
    throw new Error("Missing required argument: --route");
  }

  return {
    routeId: args.routeId,
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

export function requireMonthDbArgs(args: MonthDbArgs): RequiredMonthDbArgs {
  return {
    year: args.year ?? 2026,
    month: args.month ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

export function requireMonthRangeDbArgs(args: MonthRangeDbArgs): RequiredMonthRangeDbArgs {
  return {
    startYear: args.startYear ?? 2025,
    startMonth: args.startMonth ?? 1,
    endYear: args.endYear ?? 2026,
    endMonth: args.endMonth ?? 3,
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

export function requireDbArgs(args: DbArgs): RequiredDbArgs {
  return {
    dbPath: args.dbPath ?? defaultLocalPipelineDbPath(),
  };
}

export function createRouteMonthContext(args: RouteMonthDbArgs): RouteMonthContext {
  const options = requireRouteMonthDbArgs(args);

  return {
    ...options,
    isoMonth: isoMonth(options.year, options.month),
  };
}

export function createMonthContext(args: MonthDbArgs): MonthContext {
  const options = requireMonthDbArgs(args);

  return {
    ...options,
    isoMonth: isoMonth(options.year, options.month),
  };
}

export function createMonthRangeContext(args: MonthRangeDbArgs): MonthRangeContext {
  const options = requireMonthRangeDbArgs(args);

  return {
    ...options,
    startIsoMonth: isoMonth(options.startYear, options.startMonth),
    endIsoMonth: isoMonth(options.endYear, options.endMonth),
  };
}

export function createDbContext(args: DbArgs): RequiredDbArgs {
  return requireDbArgs(args);
}

export function createRouteArtifact<T extends object>(
  context: RouteArtifactContext,
  artifact: T,
): T & {
  routeId: string;
  analysisPeriod: string;
  generatedAt: string;
} {
  return {
    routeId: context.routeId,
    analysisPeriod: context.isoMonth,
    generatedAt: new Date().toISOString(),
    ...artifact,
  };
}

export function parseRouteMonthDbCliArgs<T extends RouteMonthDbArgs>(
  args: string[],
  output: T,
  extraOptions: readonly CliOption<T>[] = [],
): T {
  return parseCliOptions(args, output, [
    routeOption(),
    yearOption(),
    monthOption(),
    ...extraOptions,
    dbOption(fromCliPath),
  ]);
}

export function parseMonthDbCliArgs<T extends MonthDbArgs>(
  args: string[],
  output: T,
  extraOptions: readonly CliOption<T>[] = [],
): T {
  return parseCliOptions(args, output, [
    yearOption(),
    monthOption(),
    ...extraOptions,
    dbOption(fromCliPath),
  ]);
}

export function parseMonthRangeDbCliArgs<T extends MonthRangeDbArgs>(
  args: string[],
  output: T,
  extraOptions: readonly CliOption<T>[] = [],
): T {
  return parseCliOptions(args, output, [
    {
      flags: ["--start-year"],
      apply: (target, value) => {
        target.startYear = Number(value);
      },
    },
    {
      flags: ["--start-month"],
      apply: (target, value) => {
        target.startMonth = Number(value);
      },
    },
    {
      flags: ["--end-year"],
      apply: (target, value) => {
        target.endYear = Number(value);
      },
    },
    {
      flags: ["--end-month"],
      apply: (target, value) => {
        target.endMonth = Number(value);
      },
    },
    ...extraOptions,
    dbOption(fromCliPath),
  ]);
}

export function parseDbCliArgs<T extends DbArgs>(
  args: string[],
  output: T,
  extraOptions: readonly CliOption<T>[] = [],
): T {
  return parseCliOptions(args, output, [...extraOptions, dbOption(fromCliPath)]);
}

export function routeSliceKey(routeId: string, month: string): string {
  return `${routeId.toLowerCase()}-${month}`;
}
