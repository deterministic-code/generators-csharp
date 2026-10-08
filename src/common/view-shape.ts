import {
  columnFields,
  persistedColumnFields,
} from "@deterministic-code/generators-common/spec-types";
import {
  typeHasTag,
  type Type,
  type TypeField,
} from "../specification-parser.ts";

const BUILTIN_PARENTS = new Set(["set", "dictionary", "file"]);

export const isUnionLike = (type: Type): boolean => type.kind === "union";

/** Dual-tagged types emit a view class that extends the datasource class. */
export const viewExtendsDatasource = (view: Type): boolean =>
  typeHasTag(view, "datasource_type") && typeHasTag(view, "view_type");

export type ClassParent = {
  name: string;
  lane: "view" | "datasource";
};

const covers = (child: TypeField[], parent: TypeField[]): boolean => {
  const names = new Set(child.map((field) => field.name));
  return parent.every((field) => names.has(field.name));
};

/** Properties the generated class exposes. Datasource classes omit collection fields. */
export const visibleFields = (
  type: Type,
  lane: "view" | "datasource",
  typesByName?: Map<string, Type>,
): TypeField[] =>
  lane === "datasource"
    ? typesByName !== undefined
      ? persistedColumnFields(type, typesByName)
      : columnFields(type.fields)
    : type.fields;

/**
 * C# base class when `inherits` names a class and the child still has every
 * parent property. `remove_fields` that drops a parent property stays a flat
 * class, because C# cannot omit an inherited member. `set`, `dictionary`, and
 * `file` are not classes. An untagged parent that exists in the spec is still
 * a class. A dual-tagged view extends its datasource class.
 */
export const classParent = (
  type: Type,
  lane: "view" | "datasource",
  typesByName: Map<string, Type>,
): ClassParent | undefined => {
  if (lane === "view" && viewExtendsDatasource(type)) {
    const parentFields = visibleFields(
      typesByName.get(type.name) ?? type,
      "datasource",
      typesByName,
    );
    if (!covers(visibleFields(type, "view", typesByName), parentFields)) {
      return undefined;
    }
    return { name: type.name, lane: "datasource" };
  }
  const parentName = type.inherits;
  if (parentName === undefined || BUILTIN_PARENTS.has(parentName)) {
    return undefined;
  }
  const parent = typesByName.get(parentName);
  if (parent === undefined) return undefined;
  const parentLane: "view" | "datasource" =
    lane === "view" &&
    (typeHasTag(parent, "view_type") || !typeHasTag(parent, "datasource_type"))
      ? "view"
      : "datasource";
  if (
    !covers(
      visibleFields(type, lane, typesByName),
      visibleFields(parent, parentLane, typesByName),
    )
  ) {
    return undefined;
  }
  return { name: parentName, lane: parentLane };
};

/** Tagged types plus class parents that this lane must emit (untagged bases). */
export const withClassParents = (
  types: readonly Type[],
  lane: "view" | "datasource",
  typesByName: Map<string, Type>,
): Type[] => {
  const seen = new Map(types.map((type) => [type.name, type]));
  const visit = (type: Type): void => {
    const parent = classParent(type, lane, typesByName);
    if (parent === undefined || parent.lane !== lane || seen.has(parent.name)) {
      return;
    }
    const parentType = typesByName.get(parent.name);
    if (parentType === undefined) return;
    seen.set(parentType.name, parentType);
    visit(parentType);
  };
  for (const type of types) visit(type);
  return [...seen.values()];
};

/** Fields declared on this class. Parent properties stay on the base class. */
export const declaredFields = (
  type: Type,
  lane: "view" | "datasource",
  typesByName: Map<string, Type>,
): TypeField[] => {
  const fields = visibleFields(type, lane, typesByName);
  const parent = classParent(type, lane, typesByName);
  if (parent === undefined) return fields;
  const parentType = typesByName.get(parent.name);
  if (parentType === undefined) return fields;
  const parentNames = new Set(
    visibleFields(parentType, parent.lane, typesByName).map(
      (field) => field.name,
    ),
  );
  return fields.filter((field) => !parentNames.has(field.name));
};
