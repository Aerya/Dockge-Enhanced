import { io, type Socket } from "socket.io-client";

/** Avoid polling-to-WebSocket upgrade races, but retain polling-only access. */
export function createWebUiSocket(url: string): Socket {
    return io(url, {
        transports: [ "websocket", "polling" ],
        tryAllTransports: true,
    });
}
