// Box Office: the app uses the Mac's system fonts. Nothing is fetched from a
// font host at build or run time, and nothing is vendored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fontsSource = readFileSync(new URL("../../src/lib/fonts.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

test("fonts never use the Google build-time loader or a remote font", () => {
  assert.doesNotMatch(fontsSource, /next\/font\/google/);
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test("the theme uses the system (SF Pro) font stack", () => {
  for (const token of ["--font-sans", "--font-display", "--font-mono"]) {
    const line = css.split("\n").find((l) => l.trim().startsWith(`${token}:`));
    assert.ok(line, `${token} is defined`);
    assert.match(line, /-apple-system|ui-monospace/, `${token} starts from the system stack`);
  }
});

test("page titles resolve to the system display style", () => {
  assert.match(fontsSource, /instrumentSerif[^=]*=\s*\{\s*className:\s*"bo-display"/);
  assert.match(css, /\.bo-display\s*\{/);
});
