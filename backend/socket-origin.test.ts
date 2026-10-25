import test from "node:test";
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { isSocketOriginAllowed } from "./socket-origin";

const cases: [string, string | undefined, boolean][] = [
    [ "192.0.2.10:80", "http://192.0.2.10", true ],
    [ "example.test:443", "https://example.test", true ],
    [ "example.test", "https://example.test:443", true ],
    [ "[::1]:80", "http://[::1]", true ],
    [ "[2001:db8::1]:443", "https://[2001:db8::1]", true ],
    [ "EXAMPLE.test:5001", "http://example.test:5001", true ],
    [ "example.test:5001", "http://example.test", false ],
    [ "example.test:5002", "http://example.test:5001", false ],
    [ "example.test:80", "https://example.test", false ],
    [ "example.test:443", "http://example.test", false ],
    [ "example.test", "https://evil.test", false ],
    [ "[2001:db8::2]:443", "https://[2001:db8::1]", false ],
    [ "example.test", "null", false ],
    [ "example.test", "", false ],
    [ "example.test", "ftp://example.test", false ],
    [ "example.test", "https://user:pass@example.test", false ],
    [ "example.test", "https://example.test/path", false ],
    [ "example.test", "https://example.test?query", false ],
    [ "example.test", "https://example.test#fragment", false ],
    [ "example.test", "https://example.test https://evil.test", false ],
    [ "example.test", undefined, true ],
];

test("default ports are equivalent without discarding non-default ports", () => {
    for (const [ host, origin, allowed ] of cases) {
        assert.equal(isSocketOriginAllowed(host, origin), allowed, JSON.stringify({ host,
            origin }));
    }
});

test("invalid Host values cannot be interpreted as URLs", () => {
    for (const host of [ undefined, "", "user@example.test", "example.test/path", "example.test\\evil", "example.test:99999", "example.test:", "example.test,evil.test", " example.test", "%65xample.test", "::1" ]) {
        assert.equal(isSocketOriginAllowed(host, "https://example.test"), false, String(host));
    }
});

for (const transport of [ "polling", "websocket" ] as const) {
    test(`real ${transport} handshake: legacy failure and protected normalization`, async () => {
        const http = createServer();
        let legacy = true;
        const server = new Server(http, {
            allowRequest(req, done) {
                const origin = req.headers.origin;
                const allowed = legacy
                    ? !origin || req.headers.host === new URL(origin).host
                    : isSocketOriginAllowed(req.headers.host, origin);
                done(null, allowed);
            },
        });
        await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
        const address = http.address();
        assert(address && typeof address !== "string");
        const attempt = async (host: string, origin: string | undefined) => {
            if (transport === "polling") {
                return await new Promise<boolean>((resolve, reject) => {
                    const request = get(`http://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=polling`, {
                        headers: { Host: host,
                            ...(origin === undefined ? {} : { Origin: origin }),
                            "X-Forwarded-Host": "evil.test" },
                    }, response => {
                        response.resume();
                        response.once("end", () => {
                            if (response.statusCode === 200 || response.statusCode === 403) {
                                resolve(response.statusCode === 200);
                            } else {
                                reject(new Error(`Unexpected HTTP status ${response.statusCode}`));
                            }
                        });
                    });
                    request.setTimeout(1500, () => request.destroy(new Error("timeout")));
                    request.once("error", reject);
                });
            }
            const client = io(`http://127.0.0.1:${address.port}`, {
                transports: [ transport ],
                reconnection: false,
                forceNew: true,
                timeout: 1500,
                extraHeaders: {
                    Host: host,
                    ...(origin === undefined ? {} : { Origin: origin }),
                    // Spoofed forwarded headers must never override Host.
                    "X-Forwarded-Host": "evil.test",
                    "X-Forwarded-Proto": "https",
                },
            });
            try {
                return await new Promise<boolean>((resolve, reject) => {
                    client.once("connect", () => resolve(true));
                    client.once("connect_error", error => {
                        if (error.message === "timeout") {
                            reject(error);
                        } else {
                            resolve(false);
                        }
                    });
                });
            } finally {
                client.disconnect();
            }
        };
        try {
            assert.equal(await attempt("192.0.2.10:80", "http://192.0.2.10"), false);
            legacy = false;
            for (const [ host, origin, allowed ] of cases) {
                assert.equal(await attempt(host, origin), allowed, JSON.stringify({ host,
                    origin,
                    transport }));
            }
        } finally {
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });
}
