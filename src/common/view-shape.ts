import { typeHasTag, type Type } from "../specification-parser.ts";

export const isUnionLike = (type: Type): boolean => type.kind === "union";

/** Dual-tagged types emit a view class that extends the datasource class. */
export const viewExtendsDatasource = (view: Type): boolean =>
  typeHasTag(view, "datasource_type") && typeHasTag(view, "view_type");

/** Pass-through inherit of a datasource type (no extras / remove_fields). */
export const viewExtendsNamedDatasource = (
  view: Type,
  authored: Type | undefined,
  typesByName: Map<string, Type>,
): boolean => {
  if (isUnionLike(view)) return false;
  if (viewExtendsDatasource(view)) return true;
  const parent = view.inherits;
  if (parent === undefined || parent === "set" || parent === "dictionary") {
    return false;
  }
  const parentType = typesByName.get(parent);
  if (parentType === undefined || !typeHasTag(parentType, "datasource_type")) {
    return false;
  }
  return (
    (authored?.fields.length ?? 0) === 0 &&
    (authored?.removeFields?.length ?? 0) === 0
  );
};
