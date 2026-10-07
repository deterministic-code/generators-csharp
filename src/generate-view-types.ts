import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { viewTypesOf } from "@deterministic-code/generators-common/spec-types";
import {
  classParent,
  declaredFields,
  isUnionLike,
} from "./common/view-shape.ts";
import {
  DeterministicParser,
  TYPES_YAML,
  typeHasTag,
  type IDeterministic,
  type Type,
  type TypeField,
} from "./specification-parser.ts";
import { convertSpecType } from "./base-type-converter.ts";
import { Emit } from "./emit.ts";
import { typeTmpl } from "./resources/view-types.ts";

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    const typesByName = new Map(
      deterministic.expandedTypes.map((t) => [t.name, t]),
    );
    return viewTypesOf(deterministic).map((view) =>
      this.view(view, typesByName),
    );
  }

  private csTypeFor(field: TypeField, typesByName: Map<string, Type>): string {
    let base: string;
    if (field.kind === "primitive") {
      base = convertSpecType(field.base);
    } else {
      const nested = typesByName.get(field.base);
      base =
        nested !== undefined && typeHasTag(nested, "view_type")
          ? this.casing.convertTypes(field.base)
          : this.imports.datasourceQual(field.base);
    }
    if (field.isArray) base = `List<${base}>`;
    return field.isNullable ? `${base}?` : base;
  }

  private extendsType(parent: { name: string; lane: "view" | "datasource" }): string {
    return parent.lane === "view"
      ? this.casing.convertTypes(parent.name)
      : this.imports.datasourceQual(parent.name);
  }

  private view(
    view: Type,
    typesByName: Map<string, Type>,
  ): GenerateEntry {
    const className = this.casing.convertTypes(view.name);
    const isUnion = isUnionLike(view);
    const parent = classParent(view, "view", typesByName);
    const fields = declaredFields(view, "view", typesByName).map((f) => ({
      ident: this.casing.convertFields(f.name),
      csType: this.csTypeFor(f, typesByName),
    }));
    const needsList = fields.some((f) => f.csType.startsWith("List<"));
    return content(
      this.imports.view(view.name),
      fill(typeTmpl, {
        schemaVersion: this.settings.schemaVersion,
        needsList,
        simpleDoc: this.settings.simpleDoc,
        descriptionDoc: this.settings.descriptionDoc,
        className,
        datasourceType: view.inherits ?? "standard",
        target: isUnion ? "UnionView" : "ShapedView",
        fieldCount: String(fields.length),
        hasExtends: parent !== undefined,
        extendsType: parent === undefined ? "" : this.extendsType(parent),
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
