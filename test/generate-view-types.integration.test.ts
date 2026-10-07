import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { TYPES_YAML } from "../src/specification-parser.ts";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-view-types.ts";

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
      tags: [datasource_type]
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
        - tags:
            type: tag[]
        - note:
            type: string
            is_nullable: true
  - cash_payment:
      tags: [view_type]
      fields:
        - tendered:
            type: decimal
`;

const fixtureReader = () => memoryReader({ [TYPES_YAML]: TYPES });

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

describe("generate view types", () => {
  const bodyOf = async (
    suffix: string,
    settings: Record<string, string> = {},
  ) => {
    const map = indexEntries(
      await generate({ reader: fixtureReader(), settings }),
    );
    const file = [...map.keys()].find((name) => name.endsWith(suffix));
    assert.ok(file, `missing ${suffix} generate entry`);
    return entryBody(requireEntry(map, file));
  };

  it("rejects a missing types.yaml", async () => {
    await assert.rejects(
      () => generate({ reader: memoryReader({}), settings: {} }),
      /missing types\.yaml/,
    );
  });

  it("renders a shaped view, a composed union, and an inlined inherit", async () => {
    const card = await bodyOf("CardPayment.cs");
    assert.match(card, /namespace Backend\.Types\.View;/);
    assert.match(card, /public class CardPayment/);
    assert.match(card, /public string Amount \{ get; set; \}/);
    assert.match(
      card,
      /public List<Backend\.Types\.Datasource\.Tag> Tags \{ get; set; \}/,
    );
    assert.match(card, /public string\? Note \{ get; set; \}/);
    assert.match(card, /using System\.Collections\.Generic;/);
    const payment = await bodyOf("Payment.cs");
    assert.match(payment, /public class Payment\n/);
    assert.match(payment, /public string Amount \{ get; set; \}/);
    assert.match(
      payment,
      /public List<Backend\.Types\.Datasource\.Tag> Tags \{ get; set; \}/,
    );
    assert.match(payment, /public string\? Note \{ get; set; \}/);
    assert.match(payment, /public string Tendered \{ get; set; \}/);
    const summary = await bodyOf("UserSummary.cs");
    assert.match(summary, /public class UserSummary/);
    assert.doesNotMatch(summary, /: Backend\.Types\.Datasource\.User/);
    assert.match(summary, /public string DisplayName \{ get; set; \}/);
    assert.match(summary, /public string Email \{ get; set; \}/);
    assert.doesNotMatch(summary, /NickName/);
    assert.doesNotMatch(summary, /RoleId/);
  });

  it("extends any inherited class and drops fields named in remove_fields", async () => {
    const map = indexEntries(
      await generate({
        reader: memoryReader({
          [TYPES_YAML]: `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
  - tag:
      tags: [datasource_type]
      inherits: set
      fields:
        - label:
            type: string
  - profile:
      tags: [view_type]
      inherits: user
      fields:
        - title:
            type: string
  - label:
      tags: [view_type]
      inherits: tag
      fields:
        - caption:
            type: string
  - card_payment:
      tags: [view_type]
      fields:
        - amount:
            type: decimal
        - note:
            type: string
  - cash_payment:
      tags: [view_type]
      fields:
        - tendered:
            type: decimal
  - paid:
      tags: [view_type]
      union: [card_payment, cash_payment]
      remove_fields: [note]
`,
        }),
        settings: {},
      }),
    );
    const body = (suffix: string) => {
      const file = [...map.keys()].find((name) => name.endsWith(suffix));
      assert.ok(file, `missing ${suffix} generate entry`);
      return entryBody(requireEntry(map, file));
    };
    const profile = body("Profile.cs");
    assert.match(profile, /public class Profile : User\n/);
    assert.match(profile, /public string Title \{ get; set; \}/);
    assert.doesNotMatch(profile, /Email/);
    const label = body("Label.cs");
    assert.match(
      label,
      /public class Label : Backend\.Types\.Datasource\.Tag\n/,
    );
    assert.match(label, /public string Caption \{ get; set; \}/);
    assert.doesNotMatch(label, /public long Id/);
    const paid = body("Paid.cs");
    assert.match(paid, /public class Paid\n/);
    assert.match(paid, /public string Amount \{ get; set; \}/);
    assert.match(paid, /public string Tendered \{ get; set; \}/);
    assert.doesNotMatch(paid, /Note/);
  });

  it("extends the datasource type when inherit is a pass-through", async () => {
    const role = await bodyOf("Role.cs");
    assert.match(
      role,
      /public class Role : Backend\.Types\.Datasource\.Role/,
    );
  });
});
