import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import {
  authoredViewTypesOf,
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
import { Emit } from "./emit.ts";
import { typeTmpl } from "./resources/view-type-validators.ts";

class Generator extends Emit {
  private viewValidator(name: string): string {
    return this.casing.convertTypes(`${name}_validator`);
  }

  private datasourceValidator(name: string): string {
    return this.casing.convertTypes(`datasource_${name}_validator`);
  }

  private nestedValidator(
    field: TypeField,
    typesByName: Map<string, Type>,
  ): string {
    const nested = typesByName.get(field.base);
    return nested !== undefined && typeHasTag(nested, "view_type")
      ? this.viewValidator(field.base)
      : this.datasourceValidator(field.base);
  }

  private ruleLine(field: TypeField, typesByName: Map<string, Type>): string {
    const prop = this.casing.convertFields(field.name);
    const notNull = field.isNullable ? "" : "\n            .NotNull()";
    if (field.isArray) {
      const each =
        field.kind === "primitive"
          ? ""
          : `\n            .ForEach(x => x.SetValidator(new ${this.nestedValidator(field, typesByName)}()))`;
      return `        RuleFor(x => x.${prop})${notNull}${each};`;
    }
    if (field.kind === "primitive") {
      return `        RuleFor(x => x.${prop})${notNull};`;
    }
    return `        RuleFor(x => x.${prop})${notNull}\n            .SetValidator(new ${this.nestedValidator(field, typesByName)}());`;
  }

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

  private view(
    view: Type,
    authored: Type | undefined,
    typesByName: Map<string, Type>,
  ): GenerateEntry {
    const className = this.casing.convertTypes(view.name);
    const validatorClass = this.viewValidator(view.name);
    if (isUnionLike(view)) {
      return content(
        this.imports.viewValidator(view.name),
        fill(typeTmpl, {
          schemaVersion: this.settings.schemaVersion,
          isUnion: true,
          isShaped: false,
          className,
          validatorClass,
          branches: [],
          rules: [],
        }),
      );
    }
    const include =
      viewExtendsNamedDatasource(view, authored, typesByName)
        ? `        Include(new ${this.datasourceValidator(
            view.inherits !== undefined && view.inherits !== "set"
              ? view.inherits
              : view.name,
          )}());`
        : null;
    const fieldRules = viewExtendsNamedDatasource(view, authored, typesByName)
      ? []
      : view.fields.map((f) => this.ruleLine(f, typesByName));
    const rules = [include, ...fieldRules].filter(
      (x): x is string => x !== null && x !== "",
    );
    return content(
      this.imports.viewValidator(view.name),
      fill(typeTmpl, {
        schemaVersion: this.settings.schemaVersion,
        isUnion: false,
        isShaped: true,
        className,
        validatorClass,
        rules: rules.map((line) => ({ line })),
        branches: [],
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
