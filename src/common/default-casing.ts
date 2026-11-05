import {
  createCasingStrategy,
  type ICasingStrategy,
} from "@deterministic-code/generators-common/casing-strategy";
import { Paths } from "@deterministic-code/generators-common/paths";

export const GENERATOR_LANGUAGE = "csharp";

const VARIANT_PREFIXES = ["update_", "create_"] as const;

const featureEntity = (entity: string): string => {
  const prefix = VARIANT_PREFIXES.find((p) => entity.startsWith(p));
  return prefix === undefined ? entity : entity.slice(prefix.length);
};

export type PackCasing = ICasingStrategy & {
  entityName: (specName: string) => string
  fileBase: (stem: string) => string
  directory: (entity: string) => string
  filePath: (stem: string) => string
  serviceClassName: (entity: string) => string
  serviceInterfaceName: (entity: string) => string
  authoredInterfaceName: (name: string) => string
  interfaceName: (stem: string) => string
  testClassName: (entity: string) => string
  validatorTestClassName: (entity: string) => string
  getsTestName: (field: string) => string
  setsTestName: (field: string) => string
  allowsNullTestName: (field: string) => string
  acceptsMemberTestName: (name: string) => string
  nameSourceInterfaceName: (target: string) => string
  nameRowTypeName: (target: string) => string
  enrichItemsMethodName: (target: string) => string
  enrichItemMethodName: (target: string) => string
};

/** Language defaults + settings overrides. Layout (by-feature) lives on ImportGenerator. */
export const createCasing = (
  settings: Record<string, string>,
): PackCasing => {
  const casing = createCasingStrategy(GENERATOR_LANGUAGE, settings);
  const paths = new Paths();
  const fileBase = (stem: string): string => casing.convertFileName(stem);
  const entityName = (specName: string): string => casing.convertTypes(paths.typeStem(specName));
  const directory = (entity: string): string =>
    casing.convertDirectories(featureEntity(entity));
  const filePath = (stem: string): string => `${fileBase(stem)}.cs`;
  return {
    convertFileName: (text: string) => casing.convertFileName(text),
    convertTypes: (text: string) => casing.convertTypes(text),
    convertFields: (text: string) => casing.convertFields(text),
    convertDirectories: (text: string) => casing.convertDirectories(text),
    entityName,
    fileBase,
    directory,
    filePath,
    serviceClassName: (entity: string) => casing.convertTypes(`${entity}_service`),
    serviceInterfaceName: (entity: string) =>
      casing.convertTypes(`i_${entity}_service`),
    authoredInterfaceName: (name: string) => casing.convertTypes(`i_${name}`),
    interfaceName: (stem: string) => casing.convertTypes(`i_${stem}`),
    testClassName: (entity: string) => casing.convertTypes(`${entity}_tests`),
    validatorTestClassName: (entity: string) =>
      casing.convertTypes(`${entity}_validator_tests`),
    getsTestName: (field: string) => casing.convertTypes(`gets_${field}`),
    setsTestName: (field: string) => casing.convertTypes(`sets_${field}`),
    allowsNullTestName: (field: string) =>
      casing.convertTypes(`allows_setting_${field}_to_null`),
    acceptsMemberTestName: (name: string) =>
      casing.convertTypes(`accepts_${name}_member`),
    nameSourceInterfaceName: (target: string) =>
      casing.convertTypes(`i_${target}_name_source`),
    nameRowTypeName: (target: string) =>
      casing.convertTypes(`${target}_name_row`),
    enrichItemsMethodName: (target: string) =>
      casing.convertTypes(`enrich_items_with_${target}_name_async`),
    enrichItemMethodName: (target: string) =>
      casing.convertTypes(`enrich_item_with_${target}_name_async`),
  };
};

export const defaultCasing = (
  settings: Record<string, string>,
): ICasingStrategy => createCasing(settings);
