import { columnFields } from "@deterministic-code/generators-common/spec-types";
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
): TypeField[] =>
  lane === "datasource" ? columnFields(type.fields) : type.fields;

/**
 * C# base class when `inherits` names a class and the child still has every
 * parent property. `remove_fields` that drops a parent property stays a flat
 * class, because C# cannot omit an inherited member. `set` and `dictionary`
 * are not classes. A dual-tagged view extends its datasource class.
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
    );
    if (!covers(visibleFields(type, "view"), parentFields)) return undefined;
    return { name: type.name, lane: "datasource" };
  }
  const parentName = type.inherits;
  if (parentName === undefined || BUILTIN_PARENTS.has(parentName)) {
    return undefined;
  }
  const parent = typesByName.get(parentName);
  if (parent === undefined) return undefined;
  const parentLane: "view" | "datasource" =
    lane === "view" && typeHasTag(parent, "view_type") ? "view" : "datasource";
  if (parentLane === "datasource" && !typeHasTag(parent, "datasource_type")) {
    return undefined;
  }
  if (!covers(visibleFields(type, lane), visibleFields(parent, parentLane))) {
    return undefined;
  }
  return { name: parentName, lane: parentLane };
};

/** Fields declared on this class. Parent properties stay on the base class. */
export const declaredFields = (
  type: Type,
  lane: "view" | "datasource",
  typesByName: Map<string, Type>,
): TypeField[] => {
  const fields = visibleFields(type, lane);
  const parent = classParent(type, lane, typesByName);
  if (parent === undefined) return fields;
  const parentType = typesByName.get(parent.name);
  if (parentType === undefined) return fields;
  const parentNames = new Set(
    visibleFields(parentType, parent.lane).map((field) => field.name),
  );
  return fields.filter((field) => !parentNames.has(field.name));
};
