import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("editor de campos personalizados usa estrutura responsiva sem comprimir os botoes", async () => {
  const [app, styles] = await Promise.all([read("app.js"), read("styles.css")]);

  assert.match(app, /class="project-field-content"/);
  assert.match(app, /class="project-field-inputs"/);
  assert.match(app, /class="project-field-footer"/);
  assert.match(app, /class="config-checkbox compact project-field-required"/);

  assert.match(styles, /\.project-field-builder-row\s*\{[\s\S]*?grid-template-columns:\s*32px minmax\(0, 1fr\)/);
  assert.match(styles, /\.project-field-footer\s*\{[\s\S]*?justify-content:\s*space-between/);
  assert.match(styles, /@media \(max-width: 980px\)\s*\{[\s\S]*?\.project-field-inputs\s*\{\s*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(styles, /\.project-field-builder-row\s*\{\s*grid-template-columns:\s*32px 1fr 1fr/);
});

test("digitacao no placeholder preserva foco e posicao do cursor", async () => {
  const app = await read("app.js");

  assert.match(app, /function scheduleProjectFormPreviewUpdate\(event\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => \{/);
  assert.match(app, /activeField\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /activeField\.setSelectionRange\(selectionStart, selectionEnd\)/);
  assert.match(app, /addEventListener\("input", scheduleProjectFormPreviewUpdate\)/);
  assert.match(app, /\.at\(-1\)\?\.focus\(\{ preventScroll: true \}\)/);
});


test("cliques nos inputs nao remontam o construtor e o campo possui acao de inserir", async () => {
  const app = await read("app.js");

  assert.match(app, /data-project-field-insert>Inserir campo<\/button>/);
  assert.match(app, /const action = event\.target\.closest\('\[data-project-field-insert\], \[data-project-field-remove\], \[data-project-field-move\]'\);/);
  assert.match(app, /if \(!action \|\| els\.projectFieldsBuilder\.dataset\.locked === "true"\) return;/);
  assert.match(app, /Campo inserido na pré-visualização/);
  assert.doesNotMatch(app, /function handleProjectFieldBuilderClick\(event\) \{\s*const row = event\.target\.closest\('\[data-project-field-row\]'\);/);
});
