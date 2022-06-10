import fs from "node:fs";
import path from "node:path";
import dir_tree, { DirectoryTree } from "directory-tree";
import formidable from "formidable";
import sirv from "sirv";
import { TinyWSRequest, tinyws } from "tinyws";
import { WebSocket } from "ws";
import { App, Request } from "@tinyhttp/app";

const SERVER_START_TIME = Date.now();

const dir = path.resolve(process.env.DIR || ".store");
const port = parseInt(process.env.PORT || "") || 3000;

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

let tree = get_tree(dir);
let connections: WebSocket[] = [];

fs.watch(dir, { recursive: true }, () => {
    tree = get_tree(dir);
    connections.forEach((ws) => {
        ws.send(pack({ type: "update", data: tree }));
    });
});

const app = new App<any, Request & TinyWSRequest>()
    .use(tinyws())
    .use("/store", sirv(dir, { dev: true }))
    .use("/", sirv(path.resolve(__dirname, "..", "frontend")));

app.use("/ws", async (req, res) => {
    if (req.ws) {
        const ws = await req.ws();
        connections.push(ws);

        ws.on("close", () => (connections = connections.filter((conn) => conn !== ws)));

        ws.on("message", (message) => {
            console.log(`Received`, message);
        });

        ws.send(pack({ type: "update", data: tree }));
    }
});

app.post("/upload/*", async (req, res) => {
    const sub = req.path
        .replace("/upload", "")
        .split("/")
        .filter((x) => x.trim())
        .join("/");

    if (!fs.existsSync(join(sub))) {
        fs.mkdirSync(join(sub), { recursive: true });
    }

    if (fs.statSync(join(sub)).isFile()) {
        res.status(400).send("Cannot upload file to file");
        return;
    }

    const form = formidable({ multiples: true });

    form.parse(req, (err, fields, files) => {
        console.log({ sub, files });
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
    const sub = decodeURIComponent(req.path)
        .replace("/delete", "")
        .split("/")
        .filter((x) => x.trim())
        .join("/");

    if (fs.existsSync(join(sub))) {
        fs.rmSync(join(sub), { recursive: true });
        console.log("Deleted", join(sub));

        res.json({ ok: true });
    } else {
        res.json({ ok: false });
    }
});

app.post("/mkdir/*", async (req, res) => {
    const sub = decodeURIComponent(req.path)
        .replace("/mkdir", "")
        .split("/")
        .filter((x) => x.trim())
        .join("/");

    if (fs.existsSync(join(sub))) {
        res.json({ ok: false });
    } else {
        fs.mkdirSync(join(sub), { recursive: true });
        console.log("Created", join(sub));

        res.json({ ok: true });
    }
});

app.listen(port, async () => {
    console.log(`Server started at ${new Date(SERVER_START_TIME)}`);
    console.log(`Listening on port ${port}`);
    console.log(`Serving files from ${dir}`);
});

setInterval(() => {
    connections.forEach((ws) => {
        ws.send(
            pack({
                type: "ping",
                text: `Server has been running for ${Math.round(
                    (Date.now() - SERVER_START_TIME) / 1000,
                )} seconds`,
                connections: connections.length,
            }),
        );
    });
}, 30_000);

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
