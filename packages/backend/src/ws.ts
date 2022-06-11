import http from "node:http";
import ws, { WebSocketServer, WebSocket } from "ws";

export interface WebSocketRequest extends http.IncomingMessage {
    ws: () => Promise<ws>;
}

export default function (optnios?: ws.ServerOptions) {
    const wss = new WebSocketServer({ ...optnios, noServer: true });

    return async function (req: WebSocketRequest, _: unknown, next: () => void | Promise<void>) {
        const header = (req.headers.upgrade || "").split(",").map((s) => s.trim());

        if (header.indexOf("websocket") === 0) {
            req.ws = function () {
                return new Promise<ws>((r) => {
                    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), r);
                });
            };
        }

        await next();
    };
}

export { WebSocket };
