import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { datasourceTypesOf } from "@deterministic-code/generators-common/spec-types";
import {
  DeterministicParser,
  TYPES_YAML,
  type IDeterministic,
  type Type,
  type TypeField,
} from "./specification-parser.ts";
import { convertSpecType } from "./base-type-converter.ts";
import { Emit } from "./emit.ts";
import { typeTestTmpl } from "./resources/datasource-type-validators-tests.ts";

type FieldTok = {
  name: string;
  ident: string;
  sampleExpr: string;
  isNullable: boolean;
  type: string;
};

type CaseTok = {
  ident: string;
  fixture: string;
  assertion: string;
};

const samplesForNative = (
  native: string,
  fieldType: string,
): { sample: string; next: string } => {
  switch (native) {
    case "int":
      return { sample: "1", next: "2" };
    case "long":
      return { sample: "1L", next: "2L" };
    case "short":
      return { sample: "(short)1", next: "(short)2" };
    case "uint":
      return { sample: "1U", next: "2U" };
    case "ulong":
      return { sample: "1UL", next: "2UL" };
    case "ushort":
      return { sample: "(ushort)1", next: "(ushort)2" };
    case "double":
      return { sample: "1.0", next: "2.0" };
    case "bool":
      return { sample: "false", next: "true" };
    case "System.Guid":
      return {
        sample: 'System.Guid.Parse("00000000-0000-0000-0000-000000000000")',
        next: 'System.Guid.Parse("00000000-0000-0000-0000-000000000001")',
      };
    case "byte[]":
      return { sample: "new byte[] { }", next: "new byte[] { 1 }" };
    case "System.DateTime":
      return {
        sample: 'System.DateTime.Parse("2024-01-01T00:00:00.000Z")',
        next: 'System.DateTime.Parse("2024-01-02T00:00:00.000Z")',
      };
    case "string":
      if (fieldType === "decimal") return { sample: '"0"', next: '"1"' };
      if (fieldType === "uuid") {
        return {
          sample: '"00000000-0000-0000-0000-000000000000"',
          next: '"00000000-0000-0000-0000-000000000001"',
        };
      }
      if (fieldType === "datetime") {
        return {
          sample: '"2024-01-01T00:00:00.000Z"',
          next: '"2024-01-02T00:00:00.000Z"',
        };
      }
      return { sample: '"sample"', next: '"sample-next"' };
    default:
      throw new Error(`Unknown csharp native type: ${native}`);
  }
};

const fieldTok = (
  field: TypeField | { name: string; type: string; isNullable: boolean },
  convertFields: (name: string) => string,
): FieldTok => {
  const { sample } = samplesForNative(
    convertSpecType(field.type),
    field.type,
  );
  return {
    name: field.name,
    ident: convertFields(field.name),
    sampleExpr: sample,
    isNullable: field.isNullable,
    type: field.type,
  };
};

const objectLiteral = (
  cls: string,
  fields: Array<{ ident: string; expr: string }>,
): string =>
  `new ${cls} { ${fields.map((f) => `${f.ident} = ${f.expr}`).join(", ")} }`;

const casesFor = (
  cls: string,
  fields: FieldTok[],
  convertTypes: (text: string) => string,
): CaseTok[] => {
  const valid = objectLiteral(
    cls,
    fields.map((f) => ({ ident: f.ident, expr: f.sampleExpr })),
  );
  const cases: CaseTok[] = [
    { ident: "ParsesAValidPayload", fixture: valid, assertion: "True" },
  ];
  if (fields.some((f) => f.isNullable)) {
    cases.push({
      ident: "AcceptsNullForNullableFields",
      fixture: objectLiteral(
        cls,
        fields.map((f) => ({
          ident: f.ident,
          expr: f.isNullable ? "null" : f.sampleExpr,
        })),
      ),
      assertion: "True",
    });
  }
  for (const field of fields) {
    if (!field.isNullable && field.type === "string") {
      cases.push({
        ident: convertTypes(`rejects_null_for_${field.name}`),
        fixture: objectLiteral(
          cls,
          fields.map((f) => ({
            ident: f.ident,
            expr: f.ident === field.ident ? "null" : f.sampleExpr,
          })),
        ),
        assertion: "False",
      });
    }
    if (field.type === "uuid") {
      cases.push({
        ident: convertTypes(`rejects_when_invalid_uuid_on_${field.name}`),
        fixture: objectLiteral(
          cls,
          fields.map((f) => ({
            ident: f.ident,
            expr: f.ident === field.ident ? '"not-a-uuid"' : f.sampleExpr,
          })),
        ),
        assertion: "False",
      });
    }
  }
  return cases;
};

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    return datasourceTypesOf(deterministic).map((table) => this.tests(table));
  }

  private tests(table: Type): GenerateEntry {
    const fields = table.fields.map((f) =>
      fieldTok(f, (name) => this.casing.convertFields(name)),
    );
    const className = this.casing.convertTypes(table.name);
    return content(
      this.imports.test(this.imports.datasourceValidator(table.name), table.name),
      fill(typeTestTmpl, {
        schemaVersion: this.settings.schemaVersion,
        className,
        testClassName: this.casing.validatorTestClassName(table.name),
        validatorClass: this.casing.convertTypes(
          `datasource_${table.name}_validator`,
        ),
        cases: casesFor(className, fields, (text) =>
          this.casing.convertTypes(text),
        ),
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
