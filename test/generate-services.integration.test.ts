import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-services.ts";

const TYPES_YAML = `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
            size: 256
        - role_id:
            type: number
            references: role.id
  - role:
      tags: [datasource_type, view_type, readonly_lookup]
      inherits: set
      fields:
        - name:
            type: string
`;

const DATASOURCE_YAML = `types:
  - user:
      fields:
        - email:
            is_unique: true
  - role:
      fields:
        - name:
            is_unique: true
`;

const SERVICES_YAML = `includes:
  - types:
      filter: 'tag == "view_type"'
services:
  - name: ReportService
`;

const ROUTES_YAML = `routes:
  - getReport:
      method: GET
      path: /api/report
      service: ReportService
      serviceMethod: run
`;

const fixtureReader = (files: Record<string, string>) => memoryReader(files);

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(hit, `missing entry ${path}`);
  assert.equal(hit.kind, "content");
  return hit.contents;
};

const files = (extra: Record<string, string> = {}) => ({
  "types.yaml": TYPES_YAML,
  "datasource.yaml": DATASOURCE_YAML,
  "services.yaml": SERVICES_YAML,
  "routes.yaml": ROUTES_YAML,
  ...extra,
});

describe("generate-services", () => {
  it("emits empty generic stubs, custom stubs, and health", async () => {
    const entries = await generate({
      reader: fixtureReader(files()),
      settings: {},
    });

    const paths = entries
      .map((e) => (e.kind === "content" ? e.filename : e.filename))
      .sort();
    assert.ok(paths.includes("userService.cs"), `got: ${paths.join(", ")}`);
    assert.ok(paths.includes("roleService.cs"));
    assert.ok(paths.includes("../custom/reportService.cs"));
    assert.ok(paths.includes("../custom/healthCheckService.cs"));

    const user = textOf(entries, "userService.cs");
    assert.match(user, /namespace Backend\.Services\.Views;/);
    assert.match(user, /public class UserService \{ \}/);
    assert.ok(!user.includes("findBy"));

    const report = textOf(entries, "../custom/reportService.cs");
    assert.match(report, /namespace Backend\.Services\.Custom;/);
    assert.match(report, /public interface IReportService \{ \}/);
    assert.match(report, /public class ReportService : IReportService \{ \}/);
    assert.ok(!report.includes("run("));

    const health = textOf(entries, "../custom/healthCheckService.cs");
    assert.match(health, /public class HealthCheckService : IHealthCheckService/);
  });

  it("emits description doc comments when comments=description", async () => {
    const entries = await generate({
      reader: fixtureReader(
        files({
          "services.yaml": `includes:
  - types:
      filter: 'type == "user"'
services: []
`,
        }),
      ),
      settings: { comments: "description" },
    });
    const user = textOf(entries, "userService.cs");
    assert.match(user, /Datasource type: standard/);
    assert.match(user, /Target: StandardCrud/);

    const health = textOf(entries, "../custom/healthCheckService.cs");
    assert.match(health, /Target: Custom/);
  });

  it("emits simple doc comments by default", async () => {
    const entries = await generate({
      reader: fixtureReader(
        files({
          "services.yaml": `includes:
  - types:
      filter: 'type == "user"'
services: []
`,
        }),
      ),
      settings: {},
    });
    const user = textOf(entries, "userService.cs");
    assert.match(user, /\/\*\* Service UserService\. \*\//);
  });

  it("emits no doc comments when comments=none", async () => {
    const entries = await generate({
      reader: fixtureReader(
        files({
          "services.yaml": `includes:
  - types:
      filter: 'type == "user"'
services: []
`,
        }),
      ),
      settings: { comments: "none" },
    });
    const user = textOf(entries, "userService.cs");
    assert.ok(!user.includes("/**"));
  });
});
