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
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "Types/Datasource/Generated/Role.cs",
        "Types/Datasource/Generated/User.cs",
      ],
    );
  });

  it("renders User as a datasource class", async () => {
    const byName = indexEntries(
      await generate({
        reader: fixtureReader(),
        settings: { application_name: "catalog-api" },
      }),
    );
    const user = entryBody(
      requireEntry(byName, "Types/Datasource/Generated/User.cs"),
    );
    assert.match(user, /schema-version: 1\.0/);
    assert.match(user, /namespace Backend\.Types\.Datasource;/);
    assert.match(user, /public class User\n/);
    assert.match(user, /public long Id \{ get; set; \}/);
    assert.match(user, /public string Uuid \{ get; set; \}/);
    assert.match(user, /public System.DateTime Created \{ get; set; \}/);
    assert.match(user, /public System.DateTime Updated \{ get; set; \}/);
    assert.match(user, /public string Email \{ get; set; \}/);
    assert.match(user, /public long RoleId \{ get; set; \}/);
  });

  it("extends another datasource type and omits a removed parent field", async () => {
    const map = indexEntries(
      await generate({
        reader: memoryReader({
          [TYPES_YAML]: `types:
  - user:
      tags: [datasource_type]
      inherits: set
      fields:
        - email:
            type: string
  - moderator:
      tags: [datasource_type]
      inherits: user
      fields:
        - level:
            type: string
  - guest:
      tags: [datasource_type]
      inherits: user
      remove_fields: [email]
      fields:
        - token:
            type: string
`,
        }),
        settings: { application_name: "catalog-api" },
      }),
    );
    const body = (filename: string) =>
      entryBody(requireEntry(map, `Types/Datasource/Generated/${filename}`));
    const moderator = body("Moderator.cs");
    assert.match(moderator, /public class Moderator : User\n/);
    assert.match(moderator, /public string Level \{ get; set; \}/);
    assert.doesNotMatch(moderator, /Email/);
    assert.doesNotMatch(moderator, /public long Id/);
    const guest = body("Guest.cs");
    assert.match(guest, /public class Guest\n/);
    assert.match(guest, /public long Id \{ get; set; \}/);
    assert.match(guest, /public string Token \{ get; set; \}/);
    assert.doesNotMatch(guest, /Email/);
    assert.doesNotMatch(guest, /: User/);
  });

  it("emits an untagged inherit source so the child can extend it", async () => {
    const map = indexEntries(
      await generate({
        reader: memoryReader({
          [TYPES_YAML]: `types:
  - base:
      fields:
        - id:
            type: integer
            is_id: true
        - uuid:
            type: uuid
        - created:
            type: datetime
        - updated:
            type: datetime
        - version:
            type: binary
  - address_base:
      tags: [datasource_type]
      inherits: base
      fields:
        - line1:
            type: string
`,
        }),
        settings: { application_name: "catalog-api" },
      }),
    );
    assert.ok(map.has("Types/Datasource/Generated/Base.cs"));
    const body = (filename: string) =>
      entryBody(requireEntry(map, `Types/Datasource/Generated/${filename}`));
    const base = body("Base.cs");
    assert.match(base, /public class Base\n/);
    assert.match(base, /public long Id \{ get; set; \}/);
    assert.match(base, /public string Uuid \{ get; set; \}/);
    const address = body("AddressBase.cs");
    assert.match(address, /public class AddressBase : Base\n/);
    assert.match(address, /public string Line1 \{ get; set; \}/);
    assert.doesNotMatch(address, /public long Id/);
    assert.doesNotMatch(address, /public string Uuid/);
  });

  it("infers FK type from the referenced parent field", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({
          [TYPES_YAML]: `types:
  - parent:
      tags: [datasource_type]
      inherits: set
      fields: []
  - child:
      tags: [datasource_type]
      inherits: set
      fields:
        - owner_id:
            references: parent.id
`,
        }),
        settings: { application_name: "catalog-api" },
      }),
    );
    const child = entryBody(
      requireEntry(byName, "Types/Datasource/Generated/Child.cs"),
    );
    assert.match(child, /public long OwnerId \{ get; set; \}/);
    assert.doesNotMatch(child, /public string OwnerId/);
  });

  it("initializes non-zero spec defaults and skips language zeros", async () => {
    const byName = indexEntries(
      await generate({
        reader: memoryReader({
          [TYPES_YAML]: `types:
  - flags:
      tags: [datasource_type]
      inherits: set
      fields:
        - is_enabled:
            type: boolean
            default_value: true
        - is_disabled:
            type: boolean
            default_value: false
        - count:
            type: integer
            default_value: 0
        - rank:
            type: integer
            default_value: 1
        - empty_name:
            type: string
            default_value: ""
        - title:
            type: string
            default_value: hello
        - blob:
            type: binary
            default_value: Hex('00')
        - stamped:
            type: datetime
            default_value: UtcNow
        - opted_out:
            type: boolean
            is_nullable: true
            default_value: false
        - token:
            type: uuid
            default_value: NewId
        - price:
            type: decimal
            default_value: "1.50"
`,
        }),
        settings: {},
      }),
    );
    const flags = entryBody(
      requireEntry(byName, "Types/Datasource/Generated/Flags.cs"),
    );
    assert.match(flags, /public bool IsEnabled \{ get; set; \} = true;/);
    assert.match(flags, /public bool IsDisabled \{ get; set; \}/);
    assert.doesNotMatch(flags, /IsDisabled \{ get; set; \} =/);
    assert.match(flags, /public long Count \{ get; set; \}/);
    assert.doesNotMatch(flags, /Count \{ get; set; \} =/);
    assert.match(flags, /public long Rank \{ get; set; \} = 1;/);
    assert.match(flags, /public string EmptyName \{ get; set; \} = "";/);
    assert.match(flags, /public string Title \{ get; set; \} = "hello";/);
    assert.match(
      flags,
      /public byte\[\] Blob \{ get; set; \} = new byte\[\] \{ 0 \};/,
    );
    assert.match(
      flags,
      /public System\.DateTime Stamped \{ get; set; \} = DateTime\.UtcNow;/,
    );
    assert.match(flags, /public bool\? OptedOut \{ get; set; \} = false;/);
    assert.match(
      flags,
      /public string Token \{ get; set; \} = Guid\.NewGuid\(\)\.ToString\(\);/,
    );
    assert.match(flags, /public string Price \{ get; set; \} = "1.50";/);
  });
});
