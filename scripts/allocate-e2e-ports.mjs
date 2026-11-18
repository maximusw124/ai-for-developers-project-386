import { createServer } from "node:net";

const count = Number(process.argv[2] ?? 2);

async function listen() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

const servers = [];

try {
  for (let i = 0; i < count; i += 1) {
    servers.push(await listen());
  }

  const ports = servers.map((server) => {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP address");
    }
    return address.port;
  });

  if (new Set(ports).size !== ports.length) {
    throw new Error("Failed to allocate distinct ephemeral ports");
  }

  process.stdout.write(ports.join(" "));
} finally {
  for (const server of servers) {
    server.close();
  }
}
