import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { TYPES_YAML } from "../src/specification-parser.ts";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-view-types-tests.ts";

const TYPES = `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
        - role_id:
            type: number
            references: role.id
        - nick_name:
            type: string
            is_nullable: true
  - role:
      tags: [datasource_type, view_type, readonly_lookup]
      inherits: set
      fields:
        - name:
            type: string
  - tag:
      tags: [datasource_type, view_type]
      fields:
        - label:
            type: string
  - user_summary:
      tags: [view_type]
      inherits: user
      remove_fields: [nick_name, role_id]
      fields:
        - display_name:
            type: string
        - role_name:
            type: string
  - payment:
      tags: [view_type]
      union:
        - card_payment
        - cash_payment
  - card_payment:
      tags: [view_type]
      fields:
        - amount:
            type: decimal
        - paid_at:
            type: datetime
        - count:
            type: number
        - rank:
            type: integer
        - small_rank:
            type: smallinteger
        - big_rank:
            type: biginteger
        - score:
            type: float
        - active:
            type: boolean
        - token:
            type: uuid
        - avatar:
            type: binary
        - initial:
            type: character
        - ref_id:
            type: reference
        - tags:
            type: tag[]
        - owner:
            type: user_summary
        - note:
            type: string
            is_nullable: true
        - flags:
            type: boolean[]
  - cash_payment:
      tags: [view_type]
      fields:
        - tendered:
            type: decimal
  - empty_view:
      tags: [view_type]
      fields: []
  - empty_union:
      tags: [view_type]
      union: []
`;

const SIMPLE_TYPES = `types:
  - card_payment:
      tags: [view_type]
      fields:
        - amount:
            type: decimal
        - paid_at:
            type: datetime
`;

const fixtureReader = (yaml: string = TYPES) =>
  memoryReader({ [TYPES_YAML]: yaml });

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

describe("generate view types tests", () => {
  const generateWith = (
    settings: Record<string, string> = {},
    yaml?: string,
  ) =>
    generate({
      reader: fixtureReader(yaml),
      settings,
    });

  const bodyOf = async (
    suffix: string,
    settings: Record<string, string> = {},
    yaml?: string,
  ) => {
    const map = indexEntries(await generateWith(settings, yaml));
    const file = [...map.keys()].find((name) => name.endsWith(suffix));
    assert.ok(file, `missing ${suffix} generate entry`);
    return entryBody(requireEntry(map, file));
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

  it("emits one test file per expanded view", async () => {
    const byName = indexEntries(await generateWith({}));
    assert.deepEqual(
      [...byName.keys()].sort(),
      [
        "Types/View/Generated/CardPaymentTests.cs",
        "Types/View/Generated/CashPaymentTests.cs",
        "Types/View/Generated/EmptyUnionTests.cs",
        "Types/View/Generated/EmptyViewTests.cs",
        "Types/View/Generated/PaymentTests.cs",
        "Types/View/Generated/RoleTests.cs",
        "Types/View/Generated/TagTests.cs",
        "Types/View/Generated/UserSummaryTests.cs",
        "Types/View/Generated/UserTests.cs",
      ],
    );
  });

  it("renders primitive, array, nested, and nullable accessor cases", async () => {
    const card = await bodyOf("CardPaymentTests.cs");
    assert.match(card, /schema-version: 1\.0/);
    assert.match(card, /using Backend\.Types\.View;/);
    assert.match(card, /using System\.Collections\.Generic;/);
    assert.match(card, /private static CardPayment Sample\(\) => new CardPayment/);
    assert.match(card, /Amount = "0"/);
    assert.match(
      card,
      /PaidAt = System\.DateTime\.Parse\("2024-01-01T00:00:00.000Z"\)/,
    );
    assert.match(card, /Count = 1L/);
    assert.match(card, /SmallRank = \(short\)1/);
    assert.match(card, /Score = 1\.0/);
    assert.match(card, /Active = false/);
    assert.match(card, /Token = "00000000-0000-0000-0000-000000000000"/);
    assert.match(card, /Avatar = new byte\[\] \{ \}/);
    assert.match(card, /Tags = new List<Tag> \{ new Tag\(\) \}/);
    assert.match(card, /Owner = new UserSummary\(\)/);
    assert.match(card, /Flags = new List<bool> \{ false \}/);
    assert.match(card, /public void GetsNote\(/);
    assert.match(card, /public void AllowsSettingNoteToNull\(/);
    assert.doesNotMatch(card, /public void AllowsSettingAmountToNull\(/);
  });

  it("renders a union view with composed fields", async () => {
    const payment = await bodyOf("PaymentTests.cs");
    assert.match(payment, /private static Payment Sample\(\) => new Payment/);
    assert.match(payment, /public void GetsAmount\(/);
    assert.match(payment, /public void GetsTendered\(/);
    assert.match(payment, /public void GetsNote\(/);
    assert.doesNotMatch(payment, /AcceptsCardPaymentMember/);
  });

  it("renders declared fields on an inherited view and empty views", async () => {
    const summary = await bodyOf("UserSummaryTests.cs");
    assert.match(summary, /public void GetsDisplayName\(/);
    assert.match(summary, /public void GetsRoleName\(/);
    assert.match(summary, /public void GetsEmail\(/);
    const empty = await bodyOf("EmptyViewTests.cs");
    assert.match(empty, /private static EmptyView Sample\(\) => new EmptyView/);
    assert.doesNotMatch(empty, /public void Gets/);
    const union = await bodyOf("EmptyUnionTests.cs");
    assert.doesNotMatch(union, /public void Accepts/);
  });

  it("omits the List import when a view has no array fields", async () => {
    const cash = await bodyOf("CashPaymentTests.cs");
    assert.doesNotMatch(cash, /using System\.Collections\.Generic;/);
  });

  it("writes codegen.schema_version into the file header", async () => {
    const card = await bodyOf("CardPaymentTests.cs", {
      "codegen.schema_version": "9.9",
    }, SIMPLE_TYPES);
    assert.match(card, /schema-version: 9.9/);
  });

});
