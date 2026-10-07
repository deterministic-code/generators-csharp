import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-service-tests.ts";

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

const SERVICES_YAML = `includes:
  - types:
      filter: 'tag == "view_type"'
services:
  - name: ReportService
`;

const textOf = (entries: GenerateEntry[], path: string): string => {
  const hit = entries.find((e) => e.kind === "content" && e.filename === path);
  assert.ok(hit, `missing entry ${path}`);
  assert.equal(hit.kind, "content");
  return hit.contents;
};

describe("generate-service-tests", () => {
  it("emits an empty test class per generic service", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "services.yaml": SERVICES_YAML,
      }),
      settings: {},
    });
    assert.deepEqual(
      entries.map((e) => e.filename),
      ["UserServiceTests.cs"],
    );
    const body = textOf(entries, "UserServiceTests.cs");
    assert.match(body, /namespace Backend.Services.Views.Tests;/);
    assert.match(body, /public class UserServiceTests/);
  });

  it("emits nothing without a types include", async () => {
    const entries = await generate({
      reader: memoryReader({
        "types.yaml": TYPES_YAML,
        "datasource.yaml": DATASOURCE_YAML,
        "services.yaml": "services: []\n",
      }),
      settings: {},
    });
    assert.deepEqual(entries, []);
  });
});
