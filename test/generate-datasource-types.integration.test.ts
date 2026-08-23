import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { TYPES_YAML } from "../src/specification-parser.ts";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-datasource-types.ts";

const FIXTURE_YAML = `types:
  - user:
      tags: [datasource_type]
      inherits: set
      fields:
        - uuid:
            type: uuid
        - created:
            type: datetime
        - updated:
            type: datetime
        - email:
            type: string
            size: 256
        - role_id:
            type: integer
            references: role.id
  - role:
      tags: [datasource_type]
      inherits: set
      fields:
        - name:
            type: string
`;

const fixtureReader = () =>
  memoryReader({ [TYPES_YAML]: FIXTURE_YAML });

const entryBody = (entry: GenerateEntry): string => {
  if ("contents" in entry) return String(entry.contents);
  return entry.content;
};

const indexEntries = (entries: GenerateEntry[]): Map<string, GenerateEntry> => {
  const map = new Map<string, GenerateEntry>();
  for (const entry of entries) {
    assert.equal(
      map.has(entry.filename),
      false,
      `duplicate generate entry: ${entry.filename}`,
    );
    map.set(entry.filename, entry);
  }
  return map;
};

const requireEntry = (
  map: Map<string, GenerateEntry>,
  filename: string,
): GenerateEntry => {
  const entry = map.get(filename);
  assert.ok(entry, `missing generate entry: ${filename}`);
  return entry;
};

describe("generate", () => {
  it("rejects a missing types.yaml", async () => {
    await assert.rejects(
      () =>
        generate({
          reader: memoryReader({}),
          settings: {},
        }),
      /missing types\.yaml/,
    );
  });

  it("emits one class file per datasource type", async () => {
    const byName = indexEntries(
      await generate({
        reader: fixtureReader(),
        settings: { application_name: "catalog-api" },
      }),
    );
    assert.deepEqual([...byName.keys()].sort(), ["role.cs", "user.cs"]);
  });

  it("renders User against StandardDataSource", async () => {
    const byName = indexEntries(
      await generate({
        reader: fixtureReader(),
        settings: { application_name: "catalog-api" },
      }),
    );
    const user = entryBody(requireEntry(byName, "user.cs"));
    assert.match(user, /schema-version: 1\.0/);
    assert.match(user, /using Deterministic\.Types;/);
    assert.match(user, /namespace Backend\.Types\.Datasource;/);
    assert.match(
      user,
      /public class User : StandardDataSource<long, System\.DateTime>/,
    );
    assert.match(user, /public long Id \{ get; set; \}/);
    assert.match(user, /public string Uuid \{ get; set; \}/);
    assert.match(user, /public System.DateTime Created \{ get; set; \}/);
    assert.match(user, /public System.DateTime Updated \{ get; set; \}/);
    assert.match(user, /public string Email \{ get; set; \}/);
    assert.match(user, /public long RoleId \{ get; set; \}/);
  });
});
