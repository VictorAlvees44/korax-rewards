import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const legacy = readFileSync(new URL("../legacy-tv.js", import.meta.url), "utf8");

test("o receptor legado so e ativado explicitamente pela playlist das TVs", () => {
  assert.match(index, /legacy-tv\.js[^\"]*" defer/);
  assert.match(legacy, /query\.legacy !== "1"/);
  assert.match(legacy, /POLL_INTERVAL_MS = 900/);
  assert.match(legacy, /request\("ultimoGiro"/);
});

test("o receptor legado evita sintaxe JavaScript moderna incompativel com as TVs", () => {
  assert.doesNotMatch(legacy, /\b(?:const|let|class|async|await)\s+[A-Za-z_$]/);
  assert.doesNotMatch(legacy, /=>|\?\.|`/);
});
