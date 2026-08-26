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
} from "./specification-parser.ts";
import { convertSpecType } from "./base-type-converter.ts";
import { Emit } from "./emit.ts";
import { typeTestTmpl } from "./resources/datasource-types-tests.ts";

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
      if (fieldType === "decimal") {
        return { sample: '"0"', next: '"1"' };
      }
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
      if (fieldType === "date") {
        return { sample: '"2024-01-01"', next: '"2024-01-02"' };
      }
      if (fieldType === "email") {
        return {
          sample: '"sample@example.com"',
          next: '"next@example.com"',
        };
      }
      return { sample: '"sample"', next: '"sample-next"' };
    default:
      throw new Error(`Unknown csharp native type: ${native}`);
  }
};

const fieldTokens = (
  field: {
    name: string;
    type: string;
    isNullable: boolean;
  },
  convertFields: (name: string) => string,
  convertTypes: (name: string) => string,
) => {
  const ident = convertFields(field.name);
  const native = convertSpecType(field.type);
  const { sample, next } = samplesForNative(native, field.type);
  return {
    ident,
    sampleExpr: sample,
    nextExpr: next,
    nullable: field.isNullable,
    getsTest: convertTypes(`gets_${field.name}`),
    setsTest: convertTypes(`sets_${field.name}`),
    allowsNullTest: convertTypes(`allows_setting_${field.name}_to_null`),
  };
};

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    return datasourceTypesOf(deterministic).map((table) => this.tests(table));
  }

  private tests(table: Type): GenerateEntry {
    const fields = columnFields(table.fields).map((f) =>
      fieldTokens(
        f,
        (name) => this.casing.convertFields(name),
        (name) => this.casing.convertTypes(name),
      ),
    );
    return content(
      this.imports.test(this.imports.datasource(table.name), table.name),
      fill(typeTestTmpl, {
        schemaVersion: this.settings.schemaVersion,
        className: this.casing.convertTypes(table.name),
        testClassName: this.casing.testClassName(table.name),
        fields,
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
