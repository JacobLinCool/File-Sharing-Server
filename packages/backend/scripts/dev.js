import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import path from "node:path";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dist = path.join(__dirname, "../../../dist/backend");

let child = null;

chokidar.watch(dist).on("all", () => {
    if (child) {
        child.kill();
    }
    child = fork(path.join(dist, "index.js"), {
        stdio: "inherit",
        cwd: path.join(__dirname, "../../../"),
        shell: true,
        env: {
            PORT: 3001,
            PERMISSIONS: JSON.stringify({
                "": { read: ["*"], write: ["*"], delete: ["*"], mkdir: ["*"] },
                read: { read: ["*"], write: [], delete: [], mkdir: [] },
                write: { read: ["*"], write: ["*"], delete: [], mkdir: [] },
                delete: { read: ["*"], write: [], delete: ["*"], mkdir: [] },
                mkdir: { read: ["*"], write: [], delete: [], mkdir: ["*"] },
            }),
        },
    });
    console.log("Backend restarted");
});
