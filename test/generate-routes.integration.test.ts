import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-routes.ts";

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
  - order:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - label:
            type: string
  - order_item:
      tags: [datasource_type]
      inherits: set
      fields:
        - order_id:
            type: number
            references: order.id
        - sku:
            type: string
  - internal_sink:
      tags: []
      fields:
        - label:
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

const ROUTES_YAML = `includes:
  - types:
      filter: 'tag == "view_type"'
routes:
  - getReport:
      method: GET
      path: /api/report
      service: ReportService
      serviceMethod: run
combined_routes:
  - order:
      combines:
        - order_item
`;

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(
    hit,
    `missing entry ${path}; got ${entries.map((e) => e.filename).join(", ")}`,
  );
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-routes", () => {
  it("emits router stubs, custom stubs, and enrichment helpers", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "routes.yaml": ROUTES_YAML,
      }),
      settings: {},
    });

    const paths = entries.map((e) => e.filename).sort();
    assert.ok(paths.includes("usersRouter.cs"), `got: ${paths.join(", ")}`);
    assert.ok(paths.includes("rolesRouter.cs"));
    assert.ok(paths.includes("ordersRouter.cs"));
    assert.ok(!paths.includes("OrderItemsRouter.cs"));
    assert.ok(!paths.includes("InternalSinksRouter.cs"));
    assert.ok(paths.includes("../custom/getHealthRoute.cs"));
    assert.ok(paths.includes("../custom/getReportRoute.cs"));
    assert.ok(paths.includes("roleNameEnrichment.cs"));

    const users = textOf(entries, "usersRouter.cs");
    assert.match(users, /namespace Routes\.Views;/);
    assert.match(users, /public interface IUsersRouter \{ \}/);
    assert.match(users, /public class UsersRouter : IUsersRouter \{ \}/);

    const roles = textOf(entries, "rolesRouter.cs");
    assert.match(roles, /public class RolesRouter : IRolesRouter/);

    const health = textOf(entries, "../custom/getHealthRoute.cs");
    assert.match(health, /namespace Routes\.Custom;/);
    assert.match(health, /public class GetHealthRoute : IGetHealthRoute/);

    const enrich = textOf(entries, "roleNameEnrichment.cs");
    assert.match(enrich, /namespace Routes\.Enrichment;/);
    assert.match(enrich, /public static class RoleNameEnrichment/);
    assert.match(enrich, /EnrichItemsWithRoleNameAsync/);
    assert.match(enrich, /GetProperty\("RoleId"\)/);
  });

  it("emits description doc comments when comments=description", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "routes.yaml": `includes:
  - types:
      filter: 'type == "user"'
routes: []
`,
      }),
      settings: { comments: "description" },
    });
    const users = textOf(entries, "usersRouter.cs");
    assert.match(users, /Datasource type: standard/);
    assert.match(users, /Target: StandardCrud/);
  });

  it("emits simple doc comments by default", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "routes.yaml": `includes:
  - types:
      filter: 'type == "user"'
routes: []
`,
      }),
      settings: {},
    });
    const users = textOf(entries, "usersRouter.cs");
    assert.match(users, /\/\*\* Route UsersRouter\. \*\//);
  });

  it("emits no doc comments when comments=none", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "routes.yaml": `includes:
  - types:
      filter: 'type == "user"'
routes: []
`,
      }),
      settings: { comments: "none" },
    });
    const users = textOf(entries, "usersRouter.cs");
    assert.ok(!users.includes("/**"));
  });
});
