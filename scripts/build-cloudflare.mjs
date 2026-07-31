import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import path from "node:path";

const outputDirectory = "_site";

const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "project-system.js",
  "supabase-compat.js",
  "supabase-config.js",
  "security-config.js",
  "legal-config.js",
  "save-flow.js",
  "service-worker.js",
  "manifest.webmanifest",
  "logo-soften.png",
  "favicon.png",
  "icon-192.png",
  "icon-512.png"
];

await rm(outputDirectory, {
  recursive: true,
  force: true
});

await mkdir(path.join(outputDirectory, "legal"), {
  recursive: true
});

for (const file of publicFiles) {
  await cp(file, path.join(outputDirectory, file));
}

await cp(
  "legal/termo-uso-confidencialidade-v1.html",
  path.join(
    outputDirectory,
    "legal",
    "termo-uso-confidencialidade-v1.html"
  )
);

// Copia os cabeçalhos de segurança quando o arquivo existir.
try {
  await cp("_headers", path.join(outputDirectory, "_headers"));
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const release = (
  await readFile("VERSION", "utf8")
).trim();

const commit = (
  process.env.CF_PAGES_COMMIT_SHA || "local"
).slice(0, 7);

const build =
  process.env.CF_PAGES_BUILD_ID ||
  commit;

await writeFile(
  path.join(outputDirectory, "version.json"),
  `${JSON.stringify(
    {
      release,
      build,
      commit,
      builtAt: new Date().toISOString()
    },
    null,
    2
  )}\n`,
  "utf8"
);

await writeFile(
  path.join(outputDirectory, ".nojekyll"),
  "",
  "utf8"
);

console.log(
  `Arquivos preparados em ${outputDirectory}`
);
