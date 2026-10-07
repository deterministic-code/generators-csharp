import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-routes-tests.ts";

const TYPES_YAML = `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
`;

const DATASOURCE_YAML = `types:
  - user:
      fields:
        - email:
            is_unique: true
`;

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(hit, `missing entry ${path}`);
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-routes-tests", () => {
  it("emits an empty router test class per candidate", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "routes.yaml": `includes:
  - types:
      filter: 'tag == "view_type"'
routes: []
`,
      }),
      settings: {},
    });
    assert.deepEqual(
      entries.map((e) => e.filename),
      ["UsersRouterTests.cs"],
    );
    assert.match(
      textOf(entries, "UsersRouterTests.cs"),
      /public class UsersRouterTests/,
    );
  });

  it("emits nothing without a types include", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "routes.yaml": "routes: []\n",
      }),
      settings: {},
    });
    assert.deepEqual(entries, []);
  });
});
