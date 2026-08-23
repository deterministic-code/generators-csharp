import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { TYPES_YAML } from "../src/specification-parser.ts";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-view-type-validators-tests.ts";

const TYPES = `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
        - nick_name:
            type: string
            is_nullable: true
  - tag:
      tags: [datasource_type]
      fields:
        - label:
            type: string
  - payment:
      tags: [view_type]
      one_of:
        - card_payment
        - cash_payment
  - card_payment:
      tags: [view_type]
      fields:
        - amount:
            type: decimal
        - note:
            type: string
            is_nullable: true
        - tags:
            type: tag[]
  - cash_payment:
      tags: [view_type]
      fields:
        - amount:
            type: decimal
`;

const SIMPLE_TYPES = `types:
  - card_payment:
      tags: [view_type]
      fields:
        - amount:
            type: decimal
        - note:
            type: string
            is_nullable: true
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

describe("generate view type validators tests", () => {
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

  it("covers parse, nullable, and null cases for a shaped view", async () => {
    const card = await bodyOf(
      "cardPaymentValidatorTests.cs",
      {},
      SIMPLE_TYPES,
    );
    assert.match(card, /public void ParsesAValidPayload\(/);
    assert.match(card, /public void AcceptsNullForNullableFields\(/);
    assert.match(card, /public void RejectsNullForAmount\(/);
    assert.match(card, /new CardPaymentValidator\(\)\.Validate\(value\)/);
    assert.match(card, /Note = null/);
  });

  it("emits union member accept cases", async () => {
    const payment = await bodyOf("paymentValidatorTests.cs");
    assert.match(payment, /public void AcceptsCardPaymentMember\(/);
    assert.match(payment, /public void AcceptsCashPaymentMember\(/);
    assert.match(payment, /new PaymentValidator\(\)\.ValidateAndThrow\(value\)/);
    assert.match(payment, /using System\.Collections\.Generic;/);
  });

  it("writes codegen.schema_version into the file header", async () => {
    const card = await bodyOf(
      "cardPaymentValidatorTests.cs",
      { "codegen.schema_version": "9.9" },
      SIMPLE_TYPES,
    );
    assert.match(card, /schema-version: 9.9/);
  });
});
