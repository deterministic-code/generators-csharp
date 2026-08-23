import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { generate } from "../src/generate-services.ts";

const TYPES_YAML = `types:
  - notification_type:
      tags: [datasource_type, view_type]
      fields:
        - channel_name:
            type: string
`;

const DATASOURCE_YAML = `types:
  - notification_type:
      fields:
        - channel_name:
            is_unique: true
`;

const SERVICES_YAML = `includes:
  - types:
      filter: 'tag == "view_type"'
services: []
`;

const entryBody = (entry: GenerateEntry): string => {
  if ("contents" in entry) return String(entry.contents);
  return entry.content;
};

const byFilename = async (settings: Record<string, string>) => {
  const map = new Map<string, string>();
  for (const entry of await generate({
    reader: memoryReader({
      "types.yaml": TYPES_YAML,
      "datasource.yaml": DATASOURCE_YAML,
      "services.yaml": SERVICES_YAML,
    }),
    settings,
  })) {
    map.set(entry.filename, entryBody(entry));
  }
  return map;
};

describe("generate services casing", () => {
  it("Auto uses Camel files and Pascal types", async () => {
    const files = await byFilename({});
    assert.ok(files.has("notificationTypeService.cs"));
    const body = files.get("notificationTypeService.cs")!;
    assert.match(body, /public class NotificationTypeService /);
  });

  it("Pascal file names", async () => {
    const files = await byFilename({
      "languages.csharp.casing.file_names": "Pascal",
    });
    assert.ok(files.has("NotificationTypeService.cs"));
  });

  it("Snake file names", async () => {
    const files = await byFilename({
      "languages.csharp.casing.file_names": "Snake",
    });
    assert.ok(files.has("notification_type_service.cs"));
  });
});
