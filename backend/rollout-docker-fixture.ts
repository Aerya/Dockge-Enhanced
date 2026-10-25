import { createServer, request } from "node:http";
import { once } from "node:events";

/** Read-only Docker view restricted to a unique integration-test project. */
export async function fixtureDockerProxy(project: string) {
    if (!/^rollout-npm-test-[a-f0-9]{8}$/.test(project)) {
        throw new Error("Invalid test project");
    }
    const server = createServer((incoming, outgoing) => {
        const url = new URL(incoming.url ?? "/", "http://fixture");
        const route = url.pathname.replace(/^\/v\d+\.\d+/, "");
        const inspect = /^\/containers\/[a-f0-9]{12,64}\/json$/.test(route);
        if (![ "GET", "HEAD" ].includes(incoming.method ?? "") ||
            ![ "/_ping", "/version", "/containers/json", "/events" ].includes(route) && !inspect) {
            outgoing.writeHead(403).end();
            return;
        }
        if ([ "/containers/json", "/events" ].includes(route)) {
            // Never accept caller filters which could expose another project.
            url.searchParams.set("filters", JSON.stringify({ label: [ "com.docker.compose.project=" + project ] }));
        }
        const upstream = request({ socketPath: "/var/run/docker.sock",
            path: url.pathname + url.search,
            method: incoming.method }, response => {
            if (inspect) {
                let body = "";
                response.on("data", chunk => {
                    body += chunk;
                });
                response.on("end", () => {
                    try {
                        const value = JSON.parse(body);
                        if (value.Config?.Labels?.["com.docker.compose.project"] !== project) {
                            outgoing.writeHead(403).end();
                            return;
                        }
                        outgoing.writeHead(response.statusCode ?? 500, { "content-type": "application/json" }).end(body);
                    } catch {
                        outgoing.writeHead(502).end();
                    }
                });
            } else {
                outgoing.writeHead(response.statusCode ?? 500, response.headers);
                response.pipe(outgoing);
            }
        });
        upstream.on("error", () => {
            if (!outgoing.headersSent) {
                outgoing.writeHead(502);
            }
            outgoing.end();
        });
        outgoing.on("close", () => upstream.destroy());
        upstream.end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    return { port,
        close: async () => {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        } };
}
