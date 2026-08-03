import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const rootArgument = process.argv[2] || "_site";
const port = Number(process.argv[3] || process.env.PORT || 4173);
const root = path.resolve(process.cwd(), rootArgument);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp"
};

function safeFilePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const normalized = path.posix.normalize(decoded).replace(/^\.\.(\/|\\)/, "");
  const relative = normalized === "/" ? "index.html" : normalized.replace(/^\//, "");
  const candidate = path.resolve(root, relative);
  return candidate.startsWith(root) ? candidate : null;
}

async function resolveFile(requestPath) {
  const candidate = safeFilePath(requestPath);
  if (!candidate) return null;
  try {
    const details = await stat(candidate);
    if (details.isDirectory()) {
      const indexFile = path.join(candidate, "index.html");
      await access(indexFile);
      return indexFile;
    }
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const file = await resolveFile(request.url || "/");
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Arquivo não encontrado.");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream"
  });
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Servidor local: http://127.0.0.1:${port}`);
  console.log(`Diretório publicado: ${root}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
