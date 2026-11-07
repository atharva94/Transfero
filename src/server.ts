import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const port = Number(process.env.PORT ?? 4321);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a whole number between 1 and 65535.");
}

const projectRoot = path.resolve(__dirname, "..");
const publicDirectory = path.join(projectRoot, "public");
const uploadDirectory = path.join("C:\\", "photos", "uploads");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendText(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

async function serveStaticFile(response: ServerResponse, pathname: string): Promise<void> {
  const requestedFile = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!["index.html", "app.js", "style.css"].includes(requestedFile)) {
    sendText(response, 404, "Not found");
    return;
  }

  const filePath = path.join(publicDirectory, requestedFile);
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
      "Content-Length": contents.byteLength,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  } catch (error) {
    console.error(`Could not read ${filePath}:`, error);
    sendText(response, 500, "Could not load the transfer page.");
  }
}

function safePathSegment(input: string): string {
  const cleaned = input
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  if (!cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)) {
    return `_${cleaned || "upload"}`;
  }
  return cleaned;
}

function safeRelativePath(input: string): string[] {
  const normalized = input.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    segments.length > 32 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("The upload path is invalid.");
  }
  return segments.map(safePathSegment);
}

async function createUniqueFile(relativePath: string[]) {
  const directory = path.join(uploadDirectory, ...relativePath.slice(0, -1));
  await mkdir(directory, { recursive: true });
  const name = relativePath.at(-1)!;
  const extension = path.extname(name);
  const stem = extension ? name.slice(0, -extension.length) : name;

  for (let suffix = 0; ; suffix += 1) {
    const candidate = suffix === 0 ? name : `${stem} (${suffix})${extension}`;
    const filePath = path.join(directory, candidate);
    try {
      const file = await open(filePath, "wx");
      return { file, filePath, name: candidate };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
}

async function receiveUpload(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const requestedPath = url.searchParams.get("path");
  if (!requestedPath) {
    sendText(response, 400, "A file path is required.");
    request.resume();
    return;
  }

  let destination: Awaited<ReturnType<typeof createUniqueFile>> | undefined;
  try {
    destination = await createUniqueFile(safeRelativePath(requestedPath));
    await pipeline(request, destination.file.createWriteStream());
    const fileInfo = await stat(destination.filePath);
    response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ name: destination.name, size: fileInfo.size }));
  } catch (error) {
    if (error instanceof Error && error.message === "The upload path is invalid.") {
      sendText(response, 400, error.message);
      request.resume();
      return;
    }
    if (destination) {
      try {
        await unlink(destination.filePath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Could not remove incomplete upload ${destination.filePath}:`, cleanupError);
        }
      }
    }
    console.error("Upload failed:", error);
    if (!response.destroyed && !response.headersSent) {
      sendText(response, 500, "Upload failed. Check the Windows laptop and try again.");
    }
  }
}

function getLocalAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${port}`);
}

async function main(): Promise<void> {
  await mkdir(uploadDirectory, { recursive: true });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "POST" && url.pathname === "/upload") {
      void receiveUpload(request, response, url);
      return;
    }
    if (request.method === "GET") {
      void serveStaticFile(response, url.pathname);
      return;
    }
    sendText(response, 405, "Method not allowed");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Transfero is ready on port ${port}.`);
    console.log("Open one of these addresses on your iPhone (same Wi-Fi):");
    for (const address of getLocalAddresses()) {
      console.log(`  ${address}`);
    }
    console.log(`Uploads are saved to: ${uploadDirectory}`);
    console.log("Keep this window open while transferring files.");
  });
}

void main().catch((error: unknown) => {
  console.error("Could not start Transfero:", error);
  process.exitCode = 1;
});
