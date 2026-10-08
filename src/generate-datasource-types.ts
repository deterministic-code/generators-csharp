import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  datasourceTypesOf,
  tableKind,
} from "@deterministic-code/generators-common/spec-types";
import {
  DeterministicParser,
  TYPES_YAML,
  type IDeterministic,
  type Type,
  type TypeField,
} from "./specification-parser.ts";
import {
  classParent,
  declaredFields,
  withClassParents,
} from "./common/view-shape.ts";
import { convertSpecType } from "./base-type-converter.ts";
import { Emit } from "./emit.ts";
import { typeTmpl } from "./resources/datasource-types.ts";

const csTypeFor = (field: TypeField): string => {
  const t = convertSpecType(field.type);
  return field.isNullable ? `${t}?` : t;
};

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    const typesByName = new Map(
      deterministic.expandedTypes.map((type) => [type.name, type]),
    );
    return withClassParents(
      datasourceTypesOf(deterministic),
      "datasource",
      typesByName,
    ).map((table) => this.type(table, typesByName));
  }

  private type(table: Type, typesByName: Map<string, Type>): GenerateEntry {
    const { schemaVersion, simpleDoc, descriptionDoc } = this.settings;
    const parent = classParent(table, "datasource", typesByName);
    const fields = declaredFields(table, "datasource", typesByName).map((f) => ({
      ident: this.casing.convertFields(f.name),
      csType: csTypeFor(f),
    }));
    const className = this.casing.convertTypes(table.name);
    return content(
      this.imports.datasource(table.name),
      fill(typeTmpl, {
        schemaVersion,
        simpleDoc,
        descriptionDoc,
        className,
        datasourceType: tableKind(table),
        fieldCount: String(fields.length),
        hasExtends: parent !== undefined,
        extendsType:
          parent === undefined ? "" : this.casing.convertTypes(parent.name),
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
