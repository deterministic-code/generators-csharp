import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "@deterministic-code/generators-common/deterministic-reader";
import type { GenerateEntry } from "@deterministic-code/generators-common/generate-entry";
import { TYPES_YAML } from "../src/specification-parser.ts";
import { generate } from "../src/generate-view-types.ts";

const FIXTURE_YAML = `types:
  - notification_type:
      tags: [view_type]
      fields:
        - channel_name:
            type: string
`;

const entryBody = (entry: GenerateEntry): string => {
  if ("contents" in entry) return String(entry.contents);
  return entry.content;
};

const byFilename = async (settings: Record<string, string>) => {
  const map = new Map<string, string>();
  for (const entry of await generate({
    reader: memoryReader({ [TYPES_YAML]: FIXTURE_YAML }),
    settings,
  })) {
    map.set(entry.filename, entryBody(entry));
  }
  return map;
};

describe("generate view types casing", () => {
  it("Auto uses Camel files, Pascal types, Pascal fields", async () => {
    const files = await byFilename({});
    assert.ok(files.has("notificationType.cs"));
    const body = files.get("notificationType.cs")!;
    assert.match(body, /public class NotificationType/);
    assert.match(body, /public string ChannelName /);
  });

  it("Pascal file names", async () => {
    const files = await byFilename({
      "languages.csharp.casing.file_names": "Pascal",
    });
    assert.ok(files.has("NotificationType.cs"));
  });

  it("Snake file names", async () => {
    const files = await byFilename({
      "languages.csharp.casing.file_names": "Snake",
    });
    assert.ok(files.has("notification_type.cs"));
  });

  it("Camel fields", async () => {
    const files = await byFilename({
      "languages.csharp.casing.fields": "Camel",
    });
    assert.match(
      files.get("notificationType.cs")!,
      /public string channelName /,
    );
  });
});
