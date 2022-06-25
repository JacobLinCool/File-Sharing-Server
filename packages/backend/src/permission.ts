import { createHash } from "node:crypto";
import { DirectoryTree } from "directory-tree";
import { isMatch } from "matcher";
import { copy } from "./utils";

export interface Permission {
    read: string[];
    write: string[];
    delete: string[];
    mkdir: string[];
}

export type ActionType = "read" | "write" | "delete" | "mkdir";

export class PermissionManager {
    public master = process.env.MASTER_KEY || "";
    private permissions: Record<string, Permission>;

    constructor(
        config: Record<string, Partial<Permission>> = {
            "": { read: ["*"], write: ["*"], delete: ["*"], mkdir: ["*"] },
        },
        master = Math.random().toString(36).substring(2),
    ) {
        this.permissions = {};
        for (const [key, value] of Object.entries(config)) {
            const hash = createHash("sha256").update(key).digest("hex");
            this.permissions[hash] = normalize_permission(value);
        }

        this.master = master;
    }

    public check(hash: string, action: ActionType, path: string): boolean {
        const permission = this.permissions[hash];

        if (!permission) {
            return false;
        }

        switch (action) {
            case "read":
                return isMatch(path, permission.read);
            case "write":
                return isMatch(path, permission.write);
            case "delete":
                return isMatch(path, permission.delete);
            case "mkdir":
                return isMatch(path, permission.mkdir);
        }
    }

    public update(hash: string, permission: Partial<Permission>, master = ""): void {
        if (master !== this.master) {
            return;
        }

        this.permissions[hash] = {
            ...this.permissions[hash],
            ...permission,
        };
    }

    public filter(hash: string, tree: DirectoryTree): DirectoryTree {
        const permission = this.permissions[hash];

        if (!permission) {
            return { name: "", path: "", type: "directory", children: [], size: 0, custom: {} };
        }

        const copied = copy(tree);

        const filter = (node: DirectoryTree) => {
            if (node.children) {
                node.children = node.children.filter((child) => {
                    return this.check(hash, "read", child.path);
                });

                node.children.forEach(filter);
            }
        };

        filter(copied);

        return copied;
    }

    public perm(hash: string): Permission {
        return this.permissions[hash] || { read: [], write: [], delete: [], mkdir: [] };
    }
}

export const empty_hash = createHash("sha256").update("").digest("hex");

export function setup_from_env() {
    if (process.env.PERMISSIONS) {
        return new PermissionManager(JSON.parse(process.env.PERMISSIONS));
    } else {
        return new PermissionManager();
    }
}

function normalize_permission(perm: Partial<Permission>): Permission {
    const read_set = new Set(
        (perm.read || [])
            .map((p) => {
                const slices = p.split("/");
                return slices.map((s, i) => slices.slice(0, i + 1).join("/"));
            })
            .flat()
            .filter(Boolean),
    );
    const write_set = new Set(
        (perm.write || [])
            .map((p) => {
                const slices = p.split("/");
                return slices.map((s, i) => slices.slice(0, i + 1).join("/"));
            })
            .flat()
            .filter(Boolean),
    );
    const delete_set = new Set(
        (perm.delete || [])
            .map((p) => {
                const slices = p.split("/");
                return slices.map((s, i) => slices.slice(0, i + 1).join("/"));
            })
            .flat()
            .filter(Boolean),
    );
    const mkdir_set = new Set(
        (perm.mkdir || [])
            .map((p) => {
                const slices = p.split("/");
                return slices.map((s, i) => slices.slice(0, i + 1).join("/"));
            })
            .flat()
            .filter(Boolean),
    );

    return {
        read: Array.from(read_set),
        write: Array.from(write_set),
        delete: Array.from(delete_set),
        mkdir: Array.from(mkdir_set),
    };
}
