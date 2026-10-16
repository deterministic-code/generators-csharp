import {
  DeterministicDefaultValueConverter,
  type DefaultEntry,
  type SpecToken,
} from "@deterministic-code/generators-common/deterministic-default-value-converter";
import { DeterministicTypeConverter } from "@deterministic-code/generators-common/deterministic-type-converter";
import { hexToBytes } from "@deterministic-code/generators-common/default-token";

const spec = DeterministicDefaultValueConverter.spec;

const csString = (value: string): string => JSON.stringify(value);

const token = (
  specToken: SpecToken,
  native: (arg: string) => string,
  reverse: RegExp,
): DefaultEntry => ({ ...specToken, native, reverse });

const quoted = token(spec.string.String!, csString, /^"(.*)"$/);

const numeric = (type: string): Record<string, DefaultEntry> => {
  const numericSpec = spec[type]!.Numeric!;
  return {
    Numeric: token(numericSpec, (arg) => arg, numericSpec.spec),
    String: token(numericSpec, (arg) => arg, numericSpec.spec),
  };
};

export const typeConverter = new DeterministicTypeConverter({
  string: "string",
  character: "string",
  number: "long",
  integer: "long",
  unsignedinteger: "uint",
  smallinteger: "short",
  unsignedsmallinteger: "ushort",
  biginteger: "long",
  unsignedbiginteger: "ulong",
  float: "double",
  decimal: "string",
  boolean: "bool",
  datetime: "System.DateTime",
  binary: "byte[]",
  uuid: "string",
  reference: "long",
});

export const defaultValueConverter = new DeterministicDefaultValueConverter({
  string: { String: quoted, Numeric: quoted },
  character: { String: quoted, Numeric: quoted },
  number: numeric("number"),
  integer: numeric("integer"),
  unsignedinteger: numeric("unsignedinteger"),
  smallinteger: numeric("smallinteger"),
  unsignedsmallinteger: numeric("unsignedsmallinteger"),
  biginteger: numeric("biginteger"),
  unsignedbiginteger: numeric("unsignedbiginteger"),
  float: numeric("float"),
  decimal: {
    Numeric: token(spec.decimal.Numeric!, csString, /^"(.*)"$/),
    String: quoted,
  },
  boolean: {
    Boolean: token(
      spec.boolean.Boolean!,
      (arg) => (arg === "true" ? "true" : "false"),
      /^(true|false)$/,
    ),
  },
  datetime: {
    Now: token(spec.datetime.Now!, () => "DateTime.Now", /^DateTime\.Now$/),
    UtcNow: token(
      spec.datetime.UtcNow!,
      () => "DateTime.UtcNow",
      /^DateTime\.UtcNow$/,
    ),
    DateTime: token(
      spec.datetime.DateTime!,
      (arg) => `DateTime.Parse(${csString(arg)})`,
      /^DateTime\.Parse\("(.*)"\)$/,
    ),
  },
  binary: {
    Hex: token(
      spec.binary.Hex!,
      (arg) => `new byte[] { ${hexToBytes(arg).join(", ")} }`,
      /^new byte\[\] \{ .* \}$/,
    ),
  },
  uuid: {
    NewId: token(
      spec.uuid.NewId!,
      () => "Guid.NewGuid().ToString()",
      /^Guid\.NewGuid\(\)\.ToString\(\)$/,
    ),
    Empty: token(
      spec.uuid.Empty!,
      () => "Guid.Empty.ToString()",
      /^Guid\.Empty\.ToString\(\)$/,
    ),
    Uuid: token(spec.uuid.Uuid!, csString, /^"(.*)"$/),
  },
  reference: {},
});

export const toNative = (specType: string): string =>
  typeConverter.convert(specType);

export const convertSpecType = toNative;

const CS_NUMERIC = new Set([
  "long",
  "uint",
  "short",
  "ushort",
  "ulong",
  "double",
]);

const isCsZero = (specType: string, expr: string): boolean => {
  const native = toNative(specType);
  if (native === "bool") return expr === "false";
  if (CS_NUMERIC.has(native)) return /^0(\.0+)?$/.test(expr);
  return false;
};

/** Native initializer, or `undefined` when absent or the language zero. */
export const nativeDefaultExpr = (
  specType: string,
  field: {
    hasDefault?: boolean;
    defaultValue?: string | number | boolean | null;
    isNullable: boolean;
  },
): string | undefined => {
  if (field.hasDefault !== true) return undefined;
  const expr = defaultValueConverter.convert(
    specType,
    String(field.defaultValue),
  );
  if (expr === null) return undefined;
  if (field.isNullable) return expr;
  return isCsZero(specType, expr) ? undefined : expr;
};
