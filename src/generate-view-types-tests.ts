import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  dictionaryEntryFields,
  dictionaryOfField,
  viewTypesOf,
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
import { typeTestTmpl } from "./resources/view-types-tests.ts";

type FieldTok = {
  ident: string;
  sampleExpr: string;
  nextExpr: string;
  nullable: boolean;
  getsTest: string;
  setsTest: string;
  allowsNullTest: string;
};

const samplesForNative = (
  native: string,
  fieldType: string,
): { sample: string; next: string } => {
  switch (native) {
    case "long":
      return { sample: "1L", next: "2L" };
    case "short":
      return { sample: "(short)1", next: "(short)2" };
    case "double":
      return { sample: "1.0", next: "2.0" };
    case "bool":
      return { sample: "false", next: "true" };
    case "byte[]":
      return { sample: "new byte[] { }", next: "new byte[] { 1 }" };
    case "System.DateTime":
      return {
        sample: 'System.DateTime.Parse("2024-01-01T00:00:00.000Z")',
        next: 'System.DateTime.Parse("2024-01-02T00:00:00.000Z")',
      };
    default:
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
  }
};

const listElemType = (
  field: TypeField,
  convertTypes: (text: string) => string,
): string =>
  field.kind === "primitive"
    ? convertSpecType(field.base)
    : convertTypes(field.base);

const fieldTokens = (
  field: TypeField,
  convertTypes: (text: string) => string,
  convertFields: (name: string) => string,
  typesByName: Map<string, Type>,
): FieldTok => {
  const ident = convertFields(field.name);
  const dict = dictionaryOfField(field, typesByName);
  const entry = dict === undefined ? undefined : dictionaryEntryFields(dict);
  if (entry !== undefined) {
    const keyType =
      entry.key.kind === "primitive"
        ? convertSpecType(entry.key.base)
        : convertTypes(entry.key.base);
    const valueType =
      entry.value.kind === "primitive"
        ? convertSpecType(entry.value.base)
        : convertTypes(entry.value.base);
    const sample =
      entry.value.kind === "primitive"
        ? samplesForNative(valueType, entry.value.base).sample
        : `new ${valueType}()`;
    const next =
      entry.value.kind === "primitive"
        ? samplesForNative(valueType, entry.value.base).next
        : `new ${valueType}()`;
    return {
      ident,
      sampleExpr: `new Dictionary<${keyType}, ${valueType}> { ["k"] = ${sample} }`,
      nextExpr: `new Dictionary<${keyType}, ${valueType}> { ["n"] = ${next} }`,
      nullable: field.isNullable,
      getsTest: convertTypes(`gets_${field.name}`),
      setsTest: convertTypes(`sets_${field.name}`),
      allowsNullTest: convertTypes(`allows_setting_${field.name}_to_null`),
    };
  }
  if (field.kind === "primitive") {
    const pair = samplesForNative(
      convertSpecType(field.base),
      field.base,
    );
    const elem = listElemType(field, convertTypes);
    return {
      ident,
      sampleExpr: field.isArray
        ? `new List<${elem}> { ${pair.sample} }`
        : pair.sample,
      nextExpr: field.isArray
        ? `new List<${elem}> { ${pair.next} }`
        : pair.next,
      nullable: field.isNullable,
      getsTest: convertTypes(`gets_${field.name}`),
      setsTest: convertTypes(`sets_${field.name}`),
      allowsNullTest: convertTypes(`allows_setting_${field.name}_to_null`),
    };
  }
  const cls = convertTypes(field.base);
  const obj = `new ${cls}()`;
  return {
    ident,
    sampleExpr: field.isArray ? `new List<${cls}> { ${obj} }` : obj,
    nextExpr: field.isArray ? `new List<${cls}> { ${obj} }` : obj,
    nullable: field.isNullable,
    getsTest: convertTypes(`gets_${field.name}`),
    setsTest: convertTypes(`sets_${field.name}`),
    allowsNullTest: convertTypes(`allows_setting_${field.name}_to_null`),
  };
};

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    const typesByName = new Map(
      deterministic.expandedTypes.map((t) => [t.name, t]),
    );
    return viewTypesOf(deterministic).map((view) =>
      this.tests(view, typesByName),
    );
  }

  private tests(view: Type, typesByName: Map<string, Type>): GenerateEntry {
    const fields = view.fields.map((f) =>
      fieldTokens(
        f,
        (text) => this.casing.convertTypes(text),
        (name) => this.casing.convertFields(name),
        typesByName,
      ),
    );
    return content(
      this.imports.test(this.imports.view(view.name), view.name),
      fill(typeTestTmpl, {
        schemaVersion: this.settings.schemaVersion,
        className: this.casing.convertTypes(view.name),
        testClassName: this.casing.testClassName(view.name),
        isShaped: true,
        isUnion: false,
        needsList: view.fields.some((f) => f.isArray || f.isMap === true),
        fields,
        members: [],
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
