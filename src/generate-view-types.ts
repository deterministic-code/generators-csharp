import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  authoredViewTypesOf,
  unionMembers,
  viewTypesOf,
} from "@deterministic-code/generators-common/spec-types";
import {
  isUnionLike,
  viewExtendsNamedDatasource,
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
    const authoredByName = new Map(
      authoredViewTypesOf(deterministic).map((v) => [v.name, v]),
    );
    const typesByName = new Map(
      deterministic.expandedTypes.map((t) => [t.name, t]),
    );
    return viewTypesOf(deterministic).map((view) =>
      this.view(view, authoredByName.get(view.name), typesByName),
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

  private view(
    view: Type,
    authored: Type | undefined,
    typesByName: Map<string, Type>,
  ): GenerateEntry {
    const className = this.casing.convertTypes(view.name);
    const isUnion = isUnionLike(view);
    const members = unionMembers(view) ?? [];
    const hasExtends = viewExtendsNamedDatasource(view, authored, typesByName);
    const fields = isUnion || hasExtends
      ? []
      : view.fields.map((f) => ({
          ident: this.casing.convertFields(f.name),
          csType: this.csTypeFor(f, typesByName),
        }));
    const needsList =
      !isUnion && !hasExtends && view.fields.some((f) => f.isArray);
    const parent = view.inherits;
    return content(
      this.imports.view(view.name),
      fill(typeTmpl, {
        schemaVersion: this.settings.schemaVersion,
        needsList,
        simpleDoc: this.settings.simpleDoc,
        descriptionDoc: this.settings.descriptionDoc,
        className,
        datasourceType: isUnion ? "standard" : (parent ?? "standard"),
        target: isUnion ? "UnionView" : "ShapedView",
        fieldCount: String(isUnion ? members.length : fields.length),
        isUnion,
        isShaped: !isUnion,
        hasExtends,
        extendsType:
          hasExtends && parent !== undefined && parent !== "set"
            ? this.imports.datasourceQual(parent)
            : hasExtends
              ? this.imports.datasourceQual(view.name)
              : "",
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
