import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { TYPES_YAML } from "../src/specification-parser.ts";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-datasource-types-tests.ts";

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
        - created_at:
            type: datetime
        - nick_name:
            type: string
            is_nullable: true
        - active:
            type: boolean
        - balance:
            type: decimal
        - avatar:
            type: binary
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
  if (entry === undefined) {
    throw new Error(`missing generate entry: ${filename}`);
  }
  return entry;
};

describe("generate datasource types tests", () => {
  const generateWith = (settings: Record<string, string> = {}) =>
    generate({
      reader: fixtureReader(),
      settings,
    });

  const userBody = async (settings: Record<string, string> = {}) => {
    const map = indexEntries(await generateWith(settings));
    const userFile = [...map.keys()].find((name) =>
      name.endsWith("userTests.cs"),
    );
    assert.ok(userFile, "missing userTests.cs generate entry");
    return entryBody(requireEntry(map, userFile));
  };

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

  it("emits one test file per datasource type", async () => {
    const byName = indexEntries(await generateWith({}));
    assert.deepEqual(
      [...byName.keys()].sort(),
      ["roleTests.cs", "userTests.cs"],
    );
  });

  it("imports the generated type from Backend.Types.Datasource", async () => {
    const user = await userBody();
    assert.match(user, /using Backend\.Types\.Datasource;/);
    assert.match(user, /using Xunit;/);
    assert.match(user, /private static User Sample\(\) => new User/);
  });

  it("covers getters and setters for system columns and declared fields", async () => {
    const user = await userBody();
    const fields = [
      "Id",
      "Uuid",
      "Created",
      "Updated",
      "Email",
      "RoleId",
      "CreatedAt",
      "NickName",
      "Active",
      "Balance",
      "Avatar",
    ];
    for (const field of fields) {
      assert.match(user, new RegExp(`public void Gets${field}\\(`));
      assert.match(user, new RegExp(`public void Sets${field}\\(`));
    }
    assert.match(user, /public void AllowsSettingNickNameToNull\(/);
    assert.doesNotMatch(user, /public void AllowsSettingEmailToNull\(/);
    assert.match(
      user,
      /Created = System\.DateTime\.Parse\("2024-01-01T00:00:00.000Z"\)/,
    );
    assert.match(user, /Email = "sample"/);
    assert.match(user, /Active = false,/);
    assert.match(user, /Balance = "0"/);
  });

  it("writes codegen.schema_version into the file header", async () => {
    const user = await userBody({ "codegen.schema_version": "9.9" });
    assert.match(user, /schema-version: 9.9/);
  });
});
