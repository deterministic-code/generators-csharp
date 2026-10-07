import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import { TYPES_YAML } from "../src/specification-parser.ts";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-view-type-validators.ts";

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
  - tag:
      tags: [datasource_type]
      fields:
        - label:
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
        - owner:
            type: user
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

describe("generate view type validators", () => {
  const bodyOf = async (suffix: string) => {
    const map = indexEntries(
      await generate({ reader: fixtureReader(), settings: {} }),
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

  it("validates nested fields and union members", async () => {
    const card = await bodyOf("CardPaymentValidator.cs");
    assert.match(
      card,
      /public class CardPaymentValidator : AbstractValidator<Backend\.Types\.View\.CardPayment>/,
    );
    assert.match(card, /RuleFor\(x => x\.Amount\)\n\s+\.NotNull\(\);/);
    assert.match(
      card,
      /ForEach\(x => x\.SetValidator\(new DatasourceTagValidator\(\)\)\)/,
    );
    assert.match(
      card,
      /RuleFor\(x => x\.Owner\)\n\s+\.SetValidator\(new UserValidator\(\)\)/,
    );
    const payment = await bodyOf("PaymentValidator.cs");
    assert.match(
      payment,
      /public class PaymentValidator : AbstractValidator<Backend\.Types\.View\.Payment>/,
    );
    assert.match(payment, /RuleFor\(x => x\.Amount\)\n\s+\.NotNull\(\);/);
    assert.match(payment, /RuleFor\(x => x\.Tendered\)\n\s+\.NotNull\(\);/);
    assert.match(
      payment,
      /RuleFor\(x => x\.Owner\)\n\s+\.SetValidator\(new UserValidator\(\)\)/,
    );
    assert.doesNotMatch(payment, /ValidateAndThrow\(object obj\)/);
  });
});
