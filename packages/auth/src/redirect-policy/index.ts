const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function allowsLocalLoopbackRedirect(
  nodeEnv: "development" | "production" | "test",
  url: URL,
): boolean {
  return nodeEnv !== "production" && url.protocol === "http:" && loopbackHosts.has(url.hostname);
}
