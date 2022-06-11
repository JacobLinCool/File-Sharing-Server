import fs from "node:fs";
import path from "node:path";
import dir_tree, { DirectoryTree } from "directory-tree";
import formidable from "formidable";
import sirv from "sirv";
import { App, Request } from "@tinyhttp/app";
import chokidar from "chokidar";
import ws, { WebSocketRequest, WebSocket } from "./ws";
import { empty_hash, setup_from_env } from "./permission";

const SERVER_START_TIME = Date.now();

const dir = path.resolve(process.env.DIR || ".store");
const port = parseInt(process.env.PORT || "") || 3000;

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const pm = setup_from_env();
let tree = get_tree(dir);
let connections: (WebSocket & { hash?: string })[] = [];

chokidar.watch(dir, {}).on("all", () => {
    tree = get_tree(dir);
    connections.forEach((ws) => {
        ws.send(pack({ type: "update", data: pm.filter(ws.hash || empty_hash, tree) }));
    });
});

setInterval(() => {
    connections.forEach((ws) => {
        ws.send(
            pack({
                type: "ping",
                connections: connections.length,
                uptime: Math.round((Date.now() - SERVER_START_TIME) / 1000),
            }),
        );
    });
}, 30_000);

const app = new App<any, Request & WebSocketRequest>()
    .use(ws())
    .use("/", sirv(path.resolve(__dirname, "..", "frontend")));

app.use("/ws", async (req, res) => {
    if (req.ws) {
        const ws: WebSocket & { hash?: string } = await req.ws();
        connections.push(ws);

        ws.on("close", () => (connections = connections.filter((conn) => conn !== ws)));

        ws.on("message", (message) => {
            console.log(`Received`, message.toString());

            try {
                const data = JSON.parse(message.toString());
                if (data.type === "auth") {
                    ws.hash = data.token;
                    ws.send(pack({ type: "perm", data: pm.perm(ws.hash || empty_hash) }));
                    ws.send(pack({ type: "update", data: pm.filter(ws.hash || empty_hash, tree) }));
                }
            } catch {
                console.error(`Invalid message`, message);
            }
        });

        ws.hash = empty_hash;

        ws.send(pack({ type: "update", data: pm.filter(ws.hash || empty_hash, tree) }));
    }
});

app.post("/upload/*", async (req, res) => {
    const sub = decodeURIComponent(req.path)
        .replace("/upload", "")
        .split("/")
        .filter((x) => x.trim())
        .join("/");

    const hash =
        typeof req.headers["x-auth-token"] === "string" ? req.headers["x-auth-token"] : empty_hash;
    if (!pm.check(hash, "write", sub)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
    }

    if (!fs.existsSync(join(sub))) {
        fs.mkdirSync(join(sub), { recursive: true });
    }

    if (fs.statSync(join(sub)).isFile()) {
        res.status(400).send("Cannot upload file to file");
        return;
    }

    const form = formidable({ multiples: true });

    form.parse(req, (err, fields, files) => {
        res.json({ sub, files });

        for (const file of Object.values(files)) {
            if (Array.isArray(file)) {
                for (const f of file) {
                    fs.renameSync(f.filepath, join(sub, f.originalFilename || f.newFilename));
                    console.log("Uploaded", join(sub, f.originalFilename || f.newFilename));
                }
            } else {
                fs.renameSync(file.filepath, join(sub, file.originalFilename || file.newFilename));
                console.log("Uploaded", join(sub, file.originalFilename || file.newFilename));
            }
        }
    });
});

app.post("/delete/*", async (req, res) => {
    const item = decodeURIComponent(req.path)
        .replace("/delete", "")
        .split("/")
        .filter((x) => x.trim())
        .join("/");

    const hash =
        typeof req.headers["x-auth-token"] === "string" ? req.headers["x-auth-token"] : empty_hash;
    if (!pm.check(hash, "delete", item)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
    }

    if (fs.existsSync(join(item)) && join(item) !== dir) {
        fs.rmSync(join(item), { recursive: true });
        console.log("Deleted", join(item));

        res.json({ ok: true });
    } else {
        res.json({ ok: false });
    }
});

app.post("/mkdir/*", async (req, res) => {
    const item = decodeURIComponent(req.path)
        .replace("/mkdir", "")
        .split("/")
        .filter((x) => x.trim())
        .join("/");

    const hash =
        typeof req.headers["x-auth-token"] === "string" ? req.headers["x-auth-token"] : empty_hash;
    if (!pm.check(hash, "mkdir", item)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
    }

    if (fs.existsSync(join(item))) {
        res.json({ ok: false });
    } else {
        fs.mkdirSync(join(item), { recursive: true });
        console.log("Created", join(item));

        res.json({ ok: true });
    }
});

app.get("/store/*", async (req, res) => {
    const item = decodeURIComponent(req.path)
        .replace("/store", "")
        .split("/")
        .filter((x) => x.trim())
        .join("/");

    const hash =
        typeof req.headers["x-auth-token"] === "string"
            ? req.headers["x-auth-token"]
            : typeof req.query.token === "string"
            ? req.query.token
            : empty_hash;
    if (!pm.check(hash, "read", item)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
    }

    if (fs.existsSync(join(item))) {
        if (fs.statSync(join(item)).isFile()) {
            res.sendFile(join(item));
        } else {
            res.redirect(`/#/${item}`);
        }
    } else {
        res.status(404).send("Not found");
    }
});

app.listen(port, async () => {
    console.log(`Server started at ${new Date(SERVER_START_TIME)}`);
    console.log(`Listening on port ${port}`);
    console.log(`Serving files from ${dir}`);
});

function pack(data: unknown) {
    return JSON.stringify(data);
}

function get_tree(dir: string) {
    const tree = dir_tree(dir, { normalizePath: true, attributes: ["size", "type", "extension"] });

    patch(tree);

    return tree;

    function patch(node: DirectoryTree) {
        node.path = node.path.replace(dir, "");
        if (node.children) {
            node.children.sort((a, b) => (a.type === "directory" && b.type === "file" ? -1 : 1));
            node.children.forEach(patch);
        }
    }
}

function join(...paths: string[]) {
    const location = path.join(dir, ...paths);
    if (!location.startsWith(dir)) {
        return dir;
    }
    return location;
}
