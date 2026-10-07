import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { TYPES_YAML } from "../src/specification-parser.ts";
import { generate as generateDatasourceTypes } from "../src/generate-datasource-types.ts";
import { generate as generateViewTypes } from "../src/generate-view-types.ts";

const TYPES = `types:
  - file:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - name:
            type: string
            size: 64
        - settings:
            type: settings{}
            references: settings.key
  - settings:
      tags: [datasource_type]
      inherits: dictionary
      fields:
        - setting_id:
            type: integer
            references: file.id
        - key:
            type: string
            size: 64
        - value:
            type: string
            size: unlimited
  - locale_pref:
      tags: [view_type]
      fields:
        - locale:
            type: string
            size: 16
        - timezone:
            type: string
            size: 64
  - contact_prefs:
      tags: [datasource_type]
      inherits: dictionary
      fields:
        - contact_id:
            type: integer
            references: contacts_ds.id
        - key:
            type: string
            size: 64
        - value:
            type: locale_pref
  - contacts_ds:
      tags: [datasource_type]
      inherits: set
      fields:
        - email:
            type: string
            size: 256
  - contact:
      tags: [view_type]
      inherits: contacts_ds
      fields:
        - prefs:
            type: contact_prefs{}
            references: contact_prefs.key
  - card_labels:
      tags: [view_type]
      inherits: dictionary
      fields:
        - key:
            type: string
            size: 64
        - value:
            type: string
            size: 128
  - contact_card:
      tags: [view_type]
      fields:
        - display_name:
            type: string
            size: 256
        - labels:
            type: card_labels{}
            references: card_labels.key
`;

const ctx = {
  reader: memoryReader({ [TYPES_YAML]: TYPES }),
  settings: {},
};

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

const bodyEnding = (map: Map<string, GenerateEntry>, suffix: string): string => {
  const file = [...map.keys()].find((name) => name.endsWith(suffix));
  if (file === undefined) {
    throw new Error(`missing generate entry ending ${suffix}`);
  }
  return entryBody(map.get(file)!);
};

const hasEnding = (map: Map<string, GenerateEntry>, suffix: string): boolean =>
  [...map.keys()].some((name) => name.endsWith(suffix));

describe("owned dictionary codegen", () => {
  it("emits Settings as a row-shaped datasource type", async () => {
    const entries = indexEntries(await generateDatasourceTypes(ctx));
    const settings = bodyEnding(entries, "Settings.cs");
    assert.match(settings, /public class Settings/);
    assert.match(settings, /public long SettingId \{ get; set; \}/);
    assert.match(settings, /public string Key \{ get; set; \}/);
    assert.match(settings, /public string Value \{ get; set; \}/);
    assert.doesNotMatch(settings, /public long Id /);
    assert.doesNotMatch(settings, /Dictionary</);
    const file = bodyEnding(entries, "File.cs");
    assert.doesNotMatch(file, /Settings/);
    assert.doesNotMatch(file, /Dictionary</);
    const prefs = bodyEnding(entries, "ContactPrefs.cs");
    assert.match(prefs, /public string Locale \{ get; set; \}/);
    assert.match(prefs, /public string Timezone \{ get; set; \}/);
    assert.doesNotMatch(prefs, /public .* Value /);
  });

  it("attaches Dictionary on views and does not emit dictionary view classes", async () => {
    const entries = indexEntries(await generateViewTypes(ctx));
    assert.equal(hasEnding(entries, "Settings.cs"), false);
    assert.equal(hasEnding(entries, "CardLabels.cs"), false);
    assert.equal(hasEnding(entries, "ContactPrefs.cs"), false);
    const file = bodyEnding(entries, "File.cs");
    assert.match(file, /using System\.Collections\.Generic;/);
    assert.match(file, /public Dictionary<string, string> Settings \{ get; set; \}/);
    const contact = bodyEnding(entries, "Contact.cs");
    assert.match(
      contact,
      /public Dictionary<string, LocalePref> Prefs \{ get; set; \}/,
    );
    const card = bodyEnding(entries, "ContactCard.cs");
    assert.match(card, /public Dictionary<string, string> Labels \{ get; set; \}/);
    const locale = bodyEnding(entries, "LocalePref.cs");
    assert.match(locale, /public class LocalePref/);
  });
});
