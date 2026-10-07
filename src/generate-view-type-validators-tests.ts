import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  datasourceTypesOf,
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
import { typeTestTmpl } from "./resources/view-type-validators-tests.ts";

type FieldTok = {
  ident: string;
  sampleExpr: string;
  nullable: boolean;
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

const wrapValue = (
  expr: string,
  field: { isArray: boolean; isMap?: boolean },
  elemType: string,
  keyType = "string",
): string => {
  if (field.isMap === true) {
    return `new Dictionary<${keyType}, ${elemType}> { ["k"] = ${expr} }`;
  }
  return field.isArray ? `new List<${elemType}> { ${expr} }` : expr;
};

const objectLiteral = (
  cls: string,
  fields: Array<{ ident: string; expr: string }>,
): string =>
  `new ${cls} { ${fields.map((f) => `${f.ident} = ${f.expr}`).join(", ")} }`;

class Generator extends Emit {
  private readonly tables: Map<string, Type>;
  private readonly views: Map<string, Type>;
  private readonly typesByName: Map<string, Type>;

  constructor(raw: Record<string, string>, deterministic: IDeterministic) {
    super(raw);
    this.tables = new Map(
      datasourceTypesOf(deterministic).map((t) => [t.name, t]),
    );
    this.views = new Map(viewTypesOf(deterministic).map((v) => [v.name, v]));
    this.typesByName = new Map(
      deterministic.expandedTypes.map((t) => [t.name, t]),
    );
  }

  from(): GenerateEntry[] {
    return [...this.views.values()].map((view) => this.tests(view));
  }

  private dsType(name: string): string {
    return this.imports.datasourceQual(name);
  }

  private viewType(name: string): string {
    return this.imports.viewQual(name);
  }

  private renderDs(name: string): string {
    const table = this.tables.get(name);
    const cls = this.dsType(name);
    if (table === undefined) return `new ${cls}()`;
    return objectLiteral(
      cls,
      table.fields.map((f) => {
        const { sample } = samplesForNative(convertSpecType(f.type), f.type);
        return { ident: this.casing.convertFields(f.name), expr: sample };
      }),
    );
  }

  private viewFieldTok(field: TypeField, visited: Set<string>): FieldTok {
    const ident = this.casing.convertFields(field.name);
    const dict = dictionaryOfField(field, this.typesByName);
    const entry = dict === undefined ? undefined : dictionaryEntryFields(dict);
    const target = entry?.value ?? field;
    let sample: string;
    let elemType: string;
    const keyType =
      entry === undefined
        ? "string"
        : entry.key.kind === "primitive"
          ? convertSpecType(entry.key.base)
          : this.viewType(entry.key.base);
    if (target.kind === "primitive") {
      const native = convertSpecType(target.base);
      sample = samplesForNative(native, target.base).sample;
      elemType = native;
    } else if (this.views.has(target.base)) {
      sample = this.viewFixture(target.base, visited);
      elemType = this.viewType(target.base);
    } else {
      sample = this.renderDs(target.base);
      elemType = this.dsType(target.base);
    }
    return {
      ident,
      sampleExpr: wrapValue(sample, field, elemType, keyType),
      nullable: field.isNullable,
    };
  }

  private shapedToks(view: Type, visited: Set<string>): FieldTok[] {
    return view.fields.map((f) => this.viewFieldTok(f, visited));
  }

  private viewFixture(name: string, visited: Set<string>): string {
    const cls = this.viewType(name);
    if (visited.has(name)) return `new ${cls}()`;
    const view = this.views.get(name);
    if (view === undefined) return `new ${cls}()`;
    const next = new Set(visited).add(name);
    return objectLiteral(
      cls,
      this.shapedToks(view, next).map((f) => ({
        ident: f.ident,
        expr: f.sampleExpr,
      })),
    );
  }

  private shapedCases(view: Type): CaseTok[] {
    const fields = this.shapedToks(view, new Set([view.name]));
    const cls = this.viewType(view.name);
    const cases: CaseTok[] = [
      {
        ident: "ParsesAValidPayload",
        fixture: objectLiteral(
          cls,
          fields.map((f) => ({ ident: f.ident, expr: f.sampleExpr })),
        ),
        assertion: "True",
      },
    ];
    if (fields.some((f) => f.nullable)) {
      cases.push({
        ident: "AcceptsNullForNullableFields",
        fixture: objectLiteral(
          cls,
          fields.map((f) => ({
            ident: f.ident,
            expr: f.nullable ? "null" : f.sampleExpr,
          })),
        ),
        assertion: "True",
      });
    }
    for (const field of view.fields) {
      if (
        field.kind !== "primitive" ||
        field.isNullable ||
        field.isArray ||
        field.isMap === true
      ) {
        continue;
      }
      const native = convertSpecType(field.base);
      if (native !== "string") continue;
      const ident = this.casing.convertFields(field.name);
      cases.push({
        ident: this.casing.convertTypes(`rejects_null_for_${field.name}`),
        fixture: objectLiteral(
          cls,
          fields.map((f) => ({
            ident: f.ident,
            expr: f.ident === ident ? "null" : f.sampleExpr,
          })),
        ),
        assertion: "False",
      });
    }
    return cases;
  }

  private tests(view: Type): GenerateEntry {
    const cases = this.shapedCases(view);
    return content(
      this.imports.test(this.imports.viewValidator(view.name), view.name),
      fill(typeTestTmpl, {
        schemaVersion: this.settings.schemaVersion,
        className: this.casing.convertTypes(view.name),
        testClassName: this.casing.validatorTestClassName(view.name),
        validatorClass: this.casing.convertTypes(`${view.name}_validator`),
        isUnion: false,
        needsList: cases.some(
          (c) =>
            c.fixture.includes("new List<") ||
            c.fixture.includes("new Dictionary<"),
        ),
        cases,
      }),
    );
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(TYPES_YAML);
  const deterministic = await DeterministicParser(ctx.reader).parse(
    ctx.settings,
  );
  return new Generator(ctx.settings, deterministic).from();
};
