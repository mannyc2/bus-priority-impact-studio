export type CliOption<T> = {
  flags: readonly string[];
  value?: boolean;
  apply: (output: T, value: string | undefined) => void;
};

export function parseCliOptions<T>(args: string[], output: T, options: readonly CliOption<T>[]): T {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      throw new Error("Unknown or incomplete argument: ");
    }
    const option = options.find((candidate) => candidate.flags.includes(arg));
    if (option === undefined) {
      throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
    }

    if (option.value === false) {
      option.apply(output, undefined);
      continue;
    }

    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
    }
    option.apply(output, value);
    index += 1;
  }

  return output;
}

export const routeOption = <T extends { routeId?: string }>(): CliOption<T> => ({
  flags: ["--route"],
  apply: (output, value) => {
    if (value !== undefined) {
      output.routeId = value;
    }
  },
});

export const yearOption = <T extends { year?: number }>(): CliOption<T> => ({
  flags: ["--year"],
  apply: (output, value) => {
    output.year = Number(value);
  },
});

export const monthOption = <T extends { month?: number }>(): CliOption<T> => ({
  flags: ["--month"],
  apply: (output, value) => {
    output.month = Number(value);
  },
});

export const numberOption = <T>(
  flags: readonly string[],
  applyNumber: (output: T, value: number) => void,
): CliOption<T> => ({
  flags,
  apply: (output, value) => {
    applyNumber(output, Number(value));
  },
});

export const stringListOption = <T>(
  flags: readonly string[],
  applyList: (output: T, value: string[]) => void,
): CliOption<T> => ({
  flags,
  apply: (output, value) => {
    applyList(
      output,
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  },
});

export const falseOption = <T>(
  flags: readonly string[],
  applyFalse: (output: T) => void,
): CliOption<T> => ({
  flags,
  value: false,
  apply: (output) => {
    applyFalse(output);
  },
});

export const dbOption = <T extends { dbPath?: string }>(
  fromCliPath: (value: string) => string,
): CliOption<T> => ({
  flags: ["--db"],
  apply: (output, value) => {
    if (value !== undefined) {
      output.dbPath = fromCliPath(value);
    }
  },
});
