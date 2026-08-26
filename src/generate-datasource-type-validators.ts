import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  columnFields,
  datasourceTypesOf,
} from "@deterministic-code/generators-common/spec-types";
import {
  DeterministicParser,
  TYPES_YAML,
  type IDeterministic,
  type Type,
  type TypeField,
} from "./specification-parser.ts";
import { convertSpecType } from "./base-type-converter.ts";
import { Emit } from "./emit.ts";
import { typeTmpl } from "./resources/datasource-type-validators.ts";

type FieldShape = {
  name: string;
  type: string;
  isNullable: boolean;
  references?: TypeField["references"];
  minSize?: number;
  size?: TypeField["size"];
};

const STANDARD_COLUMN_NAMES = new Set(["id", "uuid", "created", "updated"]);

const UUID_PATTERN =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const numericLiteralForNative = (
  native: string,
  value: number,
): string | null => {
  switch (native) {
    case "int":
      return String(value);
    case "long":
      return `${value}L`;
    case "short":
      return `(short)${value}`;
    case "uint":
      return `${value}U`;
    case "ulong":
      return `${value}UL`;
    case "ushort":
      return `(ushort)${value}`;
    case "double":
      return Number.isInteger(value) ? `${value}.0` : String(value);
    default:
      return null;
  }
};

const numericLiteral = (fieldType: string, value: number): string => {
  const native = convertSpecType(fieldType);
  return numericLiteralForNative(native, value) ?? String(value);
};

const tightenString = (field: FieldShape): string[] => {
  const rules: string[] = [];
  if (field.minSize !== undefined && field.minSize >= 0) {
    rules.push(`MinimumLength(${field.minSize})`);
  }
  if (typeof field.size === "number" && field.size >= 0) {
    rules.push(`MaximumLength(${field.size})`);
  }
  return rules;
};

const tightenNumber = (field: FieldShape): string[] => {
  const rules: string[] = [];
  const lit = (v: number) => numericLiteral(field.type, v);
  const isFk =
    typeof field.references === "string" && field.references.length > 0;
  const isIdLike = field.name === "id" || field.name.endsWith("_id");
  if (isFk || isIdLike) {
    rules.push(`GreaterThanOrEqualTo(${lit(0)})`);
  } else if (field.minSize !== undefined) {
    rules.push(`GreaterThanOrEqualTo(${lit(field.minSize)})`);
  }
  if (typeof field.size === "number") {
    rules.push(`LessThanOrEqualTo(${lit(field.size)})`);
  }
  return rules;
};

const tightenFloat = (field: FieldShape): string[] => {
  const rules: string[] = [];
  if (field.minSize !== undefined) {
    rules.push(
      `GreaterThanOrEqualTo(${numericLiteral(field.type, field.minSize)})`,
    );
  }
  if (typeof field.size === "number") {
    rules.push(
      `LessThanOrEqualTo(${numericLiteral(field.type, field.size)})`,
    );
  }
  return rules;
};

const tightenedRulesFor = (field: FieldShape): string[] => {
  switch (field.type) {
    case "string":
    case "character":
      return tightenString(field);
    case "uuid":
      return [`Matches("${UUID_PATTERN}")`];
    case "number":
    case "integer":
    case "smallinteger":
    case "biginteger":
    case "reference":
      return tightenNumber(field);
    case "float":
      return tightenFloat(field);
    default:
      return [];
  }
};

const ruleLine = (
  field: FieldShape,
  convertFields: (name: string) => string,
): string => {
  const prop = convertFields(field.name);
  const tightened = tightenedRulesFor(field);
  const parts: string[] = [];
  if (!field.isNullable) parts.push("NotNull()");
  for (const r of tightened) parts.push(r);
  if (parts.length === 0) {
    return `        RuleFor(x => x.${prop});`;
  }
  const head = `        RuleFor(x => x.${prop})`;
  const chain = parts.map((p) => `            .${p}`).join("\n");
  if (field.isNullable && tightened.length > 0) {
    return `${head}\n${chain}\n            .When(x => x.${prop} != null);`;
  }
  return `${head}\n${chain};`;
};

const standardRuleLine = (
  name: string,
  idType: string,
  convertFields: (name: string) => string,
): string => {
  const prop = convertFields(name);
  if (name === "id") {
    const bound = numericLiteralForNative(
      convertSpecType(idType),
      0,
    );
    const numeric = bound
      ? `\n            .GreaterThanOrEqualTo(${bound})`
      : "";
    return `        RuleFor(x => x.${prop})\n            .NotNull()${numeric};`;
  }
  return `        RuleFor(x => x.${prop})\n            .NotNull();`;
};

class Generator extends Emit {
  private readonly namespace = "Backend.Validators.Datasource";
  private readonly typesNamespace = "Backend.Types.Datasource";

  from(deterministic: IDeterministic): GenerateEntry[] {
    return datasourceTypesOf(deterministic).map((table) =>
      this.validator(table),
    );
  }

  private validator(table: Type): GenerateEntry {
    const className = this.casing.convertTypes(table.name);
    const convertFields = (name: string): string =>
      this.casing.convertFields(name);
    const rules = columnFields(table.fields).map((field: TypeField) =>
      STANDARD_COLUMN_NAMES.has(field.name)
        ? standardRuleLine(field.name, field.type, convertFields)
        : ruleLine(field, convertFields),
    );
    return content(
      this.imports.datasourceValidator(table.name),
      fill(typeTmpl, {
        schemaVersion: this.settings.schemaVersion,
        namespace: this.namespace,
        typesNamespace: this.typesNamespace,
        className,
        validatorClass: this.casing.convertTypes(
          `datasource_${table.name}_validator`,
        ),
        rules: rules.map((line) => ({ line })),
      }),
    );
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(TYPES_YAML);
  return new Generator(ctx.settings).from(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
  );
};
