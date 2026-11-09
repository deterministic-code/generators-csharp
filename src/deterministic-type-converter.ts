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

const csDecimal = (arg: string): string => `${arg}m`;

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
  decimal: "decimal",
  boolean: "bool",
  datetime: "System.DateTime",
  binary: "byte[]",
  uuid: "System.Guid",
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
    Numeric: token(
      spec.decimal.Numeric!,
      csDecimal,
      /^(-?[0-9]+(?:\.[0-9]+)?)m$/,
    ),
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
      () => "Guid.NewGuid()",
      /^Guid\.NewGuid\(\)$/,
    ),
    Empty: token(spec.uuid.Empty!, () => "Guid.Empty", /^Guid\.Empty$/),
    Uuid: token(
      spec.uuid.Uuid!,
      (arg) => `Guid.Parse(${csString(arg)})`,
      /^Guid\.Parse\("(.*)"\)$/,
    ),
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
  if (native === "decimal") return /^0(?:\.0+)?m$/.test(expr);
  if (CS_NUMERIC.has(native)) return /^0(\.0+)?$/.test(expr);
  return false;
};

const CS_VALUE_TYPES = new Set([
  "bool",
  "byte",
  "sbyte",
  "short",
  "ushort",
  "int",
  "uint",
  "long",
  "ulong",
  "float",
  "double",
  "decimal",
  "DateTime",
  "Guid",
]);

export const isCsValueType = (csType: string): boolean => {
  const t = csType.endsWith("?") ? csType.slice(0, -1) : csType;
  return CS_VALUE_TYPES.has(t.slice(t.lastIndexOf(".") + 1));
};

/** Language zero for a non-nullable reference type. Value types stay uninitialized. */
export const csLanguageDefault = (csType: string): string | undefined => {
  if (csType.endsWith("?") || isCsValueType(csType)) return undefined;
  if (csType === "string") return '""';
  if (csType === "byte[]") return "[]";
  return "default!";
};

export const collectionDefaultExpr = (field: {
  isArray: boolean;
  isMap?: boolean;
  isNullable: boolean;
  defaultValue?: string | number | boolean | null | readonly [] | object;
}): string | undefined => {
  if (!field.isArray && field.isMap !== true) return undefined;
  if (field.isNullable && field.defaultValue === null) return undefined;
  return "[]";
};

/** Native initializer, or `undefined` when absent or the language zero. */
export const nativeDefaultExpr = (
  specType: string,
  field: {
    hasDefault?: boolean;
    defaultValue?: string | number | boolean | null | readonly [] | object;
    isNullable: boolean;
  },
): string | undefined => {
  if (field.hasDefault !== true) return undefined;
  if (
    field.defaultValue === null ||
    Array.isArray(field.defaultValue) ||
    (typeof field.defaultValue === "object" && field.defaultValue !== null)
  ) {
    return undefined;
  }
  const expr = defaultValueConverter.convert(
    specType,
    String(field.defaultValue),
  );
  if (expr === null) return undefined;
  if (field.isNullable) return expr;
  return isCsZero(specType, expr) ? undefined : expr;
};
