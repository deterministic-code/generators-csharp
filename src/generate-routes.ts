import { fill } from "@deterministic-code/generators-common/fill";
import type { GenerateContext } from "@deterministic-code/generators-common/generate-context";
import { content, type GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { viewTypesOf } from "@deterministic-code/generators-common/spec-types";
import {
  DeterministicParser,
  ROUTES_YAML,
  type CustomRouteEntry,
  type RouteCandidate,
  type Type,
  type IDeterministic,
} from "./specification-parser.ts";
import { Emit } from "./emit.ts";
import {
  customStubTmpl,
  nameEnrichmentTmpl,
  routerTmpl,
} from "./resources/routes.ts";

const refParent = (
  references: string | [string, string] | undefined,
): string | undefined => {
  if (typeof references !== "string") return undefined;
  return references.split(".")[0];
};

/** Unique FK targets from view types that have route candidates. */
const enrichmentTargets = (
  views: Type[],
  survivorNames: Set<string>,
): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const view of views) {
    if (!survivorNames.has(view.name)) continue;
    for (const field of view.fields) {
      const target = refParent(field.references);
      if (target === undefined || seen.has(target)) continue;
      seen.add(target);
      out.push(target);
    }
  }
  return out;
};

class Generator extends Emit {
  from(deterministic: IDeterministic): GenerateEntry[] {
    const { candidates, customs } = deterministic.routes;
    const survivorNames = new Set(candidates.map((c) => c.name));
    const targets = enrichmentTargets(
      viewTypesOf(deterministic),
      survivorNames,
    );
    return [
      ...candidates.map((c) => this.router(c)),
      ...customs.map((c) => this.custom(c)),
      ...targets.map((t) => this.enrichment(t)),
    ];
  }

  private router(candidate: RouteCandidate): GenerateEntry {
    const moduleName = this.imports.routeModule(candidate.name);
    const className = this.casing.convertTypes(moduleName);
    return content(
      this.imports.route(candidate.name),
      fill(routerTmpl, {
        simpleDoc: this.settings.simpleDoc,
        descriptionDoc: this.settings.descriptionDoc,
        className,
        interfaceName: this.casing.interfaceName(moduleName),
      }),
    );
  }

  private custom(entry: CustomRouteEntry): GenerateEntry {
    const className = this.casing.convertTypes(`${entry.name}_route`);
    return content(
      this.imports.routeCustom(entry.name),
      fill(customStubTmpl, {
        interfaceName: this.casing.interfaceName(`${entry.name}_route`),
        className,
      }),
    );
  }

  private enrichment(targetTable: string): GenerateEntry {
    return content(
      this.imports.enrichment(targetTable),
      fill(nameEnrichmentTmpl, {
        className: this.casing.convertTypes(`${targetTable}_name_enrichment`),
        enrichItemsMethod: this.casing.enrichItemsMethodName(targetTable),
        enrichItemMethod: this.casing.enrichItemMethodName(targetTable),
        sourceInterfaceName: this.casing.nameSourceInterfaceName(targetTable),
        rowTypeName: this.casing.nameRowTypeName(targetTable),
        targetTable,
        fkProp: this.casing.convertFields(`${targetTable}_id`),
        nameProp: this.casing.convertFields(`${targetTable}_name`),
      }),
    );
  }
}

export const generate = async (
  ctx: GenerateContext,
): Promise<GenerateEntry[]> => {
  await ctx.reader.read(ROUTES_YAML);
  return new Generator(ctx.settings).from(
    await DeterministicParser(ctx.reader).parse(ctx.settings),
  );
};
