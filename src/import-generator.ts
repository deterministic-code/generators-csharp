import pluralize from "pluralize";
import type { IImportGenerator } from "@deterministic-code/generators-common/import-generator";
import { createCasing, type PackCasing } from "./common/default-casing.ts";

const VARIANT_PREFIXES = ["update_", "create_"] as const;

const featureEntity = (entity: string): string => {
  const prefix = VARIANT_PREFIXES.find((p) => entity.startsWith(p));
  return prefix === undefined ? entity : entity.slice(prefix.length);
};

const pluralSnake = (entity: string): string => {
  const parts = entity.split(/[_-]/);
  parts[parts.length - 1] = pluralize.plural(parts[parts.length - 1]!);
  return parts.join("_");
};

const DATASOURCE_DIR = "Types/Generated/Datasource";
const VIEW_DIR = "Types/Generated/Views";
const DATASOURCE_VALIDATOR_DIR = `${DATASOURCE_DIR}/Validators`;
const VIEW_VALIDATOR_DIR = `${VIEW_DIR}/Validators`;

export class CsharpImportGenerator implements IImportGenerator {
  private readonly organizeByFeature: boolean;
  private readonly flat: boolean;
  private readonly basePath: string;
  private readonly casing: PackCasing;

  constructor(basePath: string, settings: Record<string, string>) {
    this.basePath = basePath;
    this.flat = basePath !== "" && basePath !== ".";
    this.organizeByFeature =
      !this.flat && settings["other.organize_by_feature"] === "true";
    this.casing = createCasing(settings);
  }

  datasource(entity: string): string {
    return this.underBase(this.rel(DATASOURCE_DIR, this.casedFile(entity)));
  }

  datasourceRel(entity: string): string {
    return this.datasource(entity);
  }

  datasourceQual(entity: string): string {
    return `Backend.Types.Datasource.${this.casing.convertTypes(entity)}`;
  }

  datasourceValidator(entity: string): string {
    return this.underBase(
      this.rel(
        DATASOURCE_VALIDATOR_DIR,
        this.csFile(`datasource_${entity}_validator`),
      ),
    );
  }

  datasourceValidatorRel(entity: string): string {
    return this.datasourceValidator(entity);
  }

  view(entity: string): string {
    return this.underBase(this.rel(VIEW_DIR, this.csFile(entity)));
  }

  viewRel(entity: string): string {
    return this.view(entity);
  }

  viewQual(entity: string): string {
    return `Backend.Types.View.${this.casing.convertTypes(entity)}`;
  }

  viewValidator(entity: string): string {
    return this.underBase(
      this.rel(VIEW_VALIDATOR_DIR, this.csFile(`${entity}_validator`)),
    );
  }

  viewValidatorRel(entity: string): string {
    return this.viewValidator(entity);
  }

  service(entity: string): string {
    return this.underBase(this.csFile(`${entity}_service`));
  }

  serviceRel(entity: string): string {
    return this.service(entity);
  }

  serviceCustom(name: string, _module?: string): string {
    const file = this.csFile(name);
    return this.underBase(
      this.organizeByFeature
        ? `Features/${this.casing.directory(featureEntity(name))}/custom/${file}`
        : `../custom/${file}`,
    );
  }

  serviceCustomRel(entity: string): string {
    const file = this.csFile(entity);
    return this.organizeByFeature
      ? `Features/${this.casing.directory(entity)}/custom/${file}`
      : `../custom/${file}`;
  }

  serviceTest(entity: string): string {
    return this.underBase(this.csFile(`${entity}_service_tests`));
  }

  serviceTestRel(entity: string): string {
    return this.serviceTest(entity);
  }

  serviceIntegrationTest(entity: string): string {
    return this.serviceTest(entity);
  }

  serviceIntegrationTestRel(entity: string): string {
    return this.serviceIntegrationTest(entity);
  }

  serviceUse(_entity: string, _symbol: string): string {
    return "";
  }

  route(entity: string): string {
    return this.underBase(`${this.routeModule(entity)}.cs`);
  }

  routeRel(entity: string): string {
    return this.route(entity);
  }

  routeCustom(name: string, _module?: string): string {
    const file = this.csFile(`${name}_route`);
    return this.underBase(
      this.organizeByFeature
        ? `Features/${this.casing.directory(featureEntity(name))}/custom/${file}`
        : `../custom/${file}`,
    );
  }

  routeTest(entity: string): string {
    return this.underBase(
      this.csFile(`${pluralSnake(entity)}_router_tests`),
    );
  }

  enrichment(targetTable: string): string {
    return this.underBase(this.csFile(`${targetTable}_name_enrichment`));
  }

  test(srcFile: string, fileBase: string): string {
    const stem = srcFile.includes("Validator")
      ? `${fileBase}_validator_tests`
      : `${fileBase}_tests`;
    const file = this.csFile(stem);
    const slash = srcFile.lastIndexOf("/");
    if (slash === -1) return this.underBase(file);
    return `${srcFile.slice(0, slash)}/${file}`;
  }

  testSpec(_srcFile: string, _fileBase: string): string {
    return "";
  }

  index(_beside: string): string {
    return "";
  }

  spec(_fromFile: string, _toFile: string): string {
    return "Backend.Types.Datasource";
  }

  routeModule(entity: string): string {
    return this.casing.fileBase(`${pluralSnake(entity)}_router`);
  }

  appWiring(): string {
    return "";
  }

  validatorFn(
    _kind: "datasource" | "view",
    _entity: string,
    _fn: string,
  ): string {
    return "";
  }

  apiPath(entity: string): string {
    return entity.replace(/_/g, "-");
  }

  frontend(relPath: string): string {
    return `frontend/${relPath}`;
  }

  private csFile(stem: string): string {
    return `${this.casing.fileBase(stem)}.cs`;
  }

  private casedFile(entity: string): string {
    const file = this.csFile(entity);
    return this.organizeByFeature
      ? `Features/${this.casing.directory(entity)}/${file}`
      : file;
  }

  private rel(prefix: string, file: string): string {
    if (this.organizeByFeature || this.flat) return file;
    return `${prefix}/${file}`;
  }

  private underBase(file: string): string {
    if (!this.flat) return file;
    return `${this.basePath}/${file}`;
  }
}

export const createImportGenerator = (
  basePath: string,
  settings: Record<string, string>,
): CsharpImportGenerator => new CsharpImportGenerator(basePath, settings);
