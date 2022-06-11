<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import "@master/css";

interface Node {
    name: string;
    children?: Node[];
    size: number;
    type: "directory" | "file";
    extension: string;
    path: string;
}

const tree: Node = reactive({
    name: "undefined",
    children: [],
    size: 0,
    type: "directory",
    extension: "",
    path: "/",
});
const current = ref(window.location.hash.slice(1) || "/");
const dir = computed(() => {
    document.title = current.value.split("/").filter(Boolean).length
        ? "/" + current.value.split("/").filter(Boolean).map(decodeURIComponent).join("/") + "/"
        : "/";
    return subtree();
});

const token = localStorage.getItem("token") || "";
const ws = new WebSocket(
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`,
);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log(data);

    if (data.type === "update") {
        Object.assign(tree, data.data);
    }
};

ws.onopen = async () => {
    ws.send(JSON.stringify({ type: "auth", token: await sha256(token) }));
};

window.addEventListener("load", () => {
    // @ts-ignore
    window.ws = ws;
});

window.addEventListener("hashchange", () => {
    current.value = window.location.hash.slice(1);
});

function subtree() {
    const path = current.value
        .split("/")
        .filter((x) => x.trim())
        .map(decodeURIComponent);

    let node = tree;
    for (const name of path) {
        if (node.children) {
            const child = node.children.find((child) => child.name === name);
            if (child) {
                node = child;
            }
        }
    }

    console.log(path, node);

    return node;
}

function go(name: string) {
    window.location.hash = name;
}

async function download(path: string) {
    const win = window.open("", "_blank");
    if (win?.location) {
        win.location.href = `/store${path}?token=${await sha256(token)}`;
    }
}

async function upload() {
    const files: FileList | null = await new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.onchange = (event) => {
            const target = event.target as HTMLInputElement;
            resolve(target.files);
        };
        input.click();
    });

    if (files) {
        const form = new FormData();
        for (let i = 0; i < files.length; i++) {
            form.append("files", files[i]);
        }
        const res = await fetch("/upload/" + current.value.split("/").filter(Boolean).join("/"), {
            method: "POST",
            headers: { "X-AUTH-TOKEN": await sha256(token) },
            body: form,
        });

        if (res.ok) {
            const data = await res.json();
            console.log(data);
        } else {
            console.error(await res.text());
        }
    }
}

async function mkdir() {
    const name = prompt("Folder name");
    if (name) {
        const res = await fetch(
            "/mkdir/" + current.value.split("/").filter(Boolean).join("/") + "/" + name,
            {
                method: "POST",
                headers: { "X-AUTH-TOKEN": await sha256(token) },
            },
        );

        if (res.ok) {
            const data = await res.json();
            console.log(data);
        } else {
            console.error(await res.text());
        }
    }
}

async function remove(path: string) {
    if (
        !confirm(
            `Are you sure you want to delete "${path
                .split("/")
                .filter((x) => x.trim())
                .slice(-1)}" ?`,
        )
    ) {
        return;
    }
    const res = await fetch("/delete/" + path, {
        method: "POST",
        headers: { "X-AUTH-TOKEN": await sha256(token) },
    });

    if (res.ok) {
        const data = await res.json();
        console.log(data);
    } else {
        console.error(await res.text());
    }
}

function auth() {
    const token = prompt("Enter the password (token):");
    if (token) {
        localStorage.setItem("token", token);
    } else {
        localStorage.removeItem("token");
    }
    window.location.reload();
}

async function sha256(data: string) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
</script>

<template>
    <div class="w-full h-full">
        <div>
            <button
                @click="upload"
                class="m:8 p:12 f:20 color:blue-60 b:1|solid|blue-60 r:8 transition:all|200ms bg:blue-60:hover color:white:hover"
            >
                Upload
            </button>
            <button
                @click="mkdir"
                class="m:8 p:12 f:20 color:green-60 b:1|solid|green-60 r:8 transition:all|200ms bg:green-60:hover color:white:hover"
            >
                New Folder
            </button>
            <button
                @click="auth"
                class="m:8 p:12 f:20 color:orange-60 b:1|solid|orange-60 r:8 transition:all|200ms bg:orange-60:hover color:white:hover"
            >
                Auth
            </button>

            <span class="m:8 p:12 f:16 f:mono">
                <span @click="go('/')" class="cursor:pointer">/</span>
                <span
                    v-for="(name, i) in current.split('/').filter(Boolean).map(decodeURIComponent)"
                    :key="name"
                    @click="
                        go(
                            current
                                .split('/')
                                .filter(Boolean)
                                .slice(0, i + 1)
                                .join('/'),
                        )
                    "
                    class="cursor:pointer"
                    >{{ name }}/</span
                >
            </span>
        </div>
        <transition
            mode="out-in"
            enter-active-class="transition:all|200ms|ease-out"
            enter-from-class="opacity:0"
            enter-to-class="opacity:100"
            leave-active-class="transition:all|150ms|ease-in"
            leave-from-class="opacity:100"
            leave-to-class="opacity:0"
        >
            <div :key="current">
                <div v-if="current && current !== '/'">
                    <button
                        @click="go(current.split('/').filter(Boolean).slice(0, -1).join('/'))"
                        class="m:8 p:16 f:20 cursor:pointer"
                    >
                        Parent
                    </button>
                </div>
                <div
                    v-for="item in dir.children"
                    :key="item.name"
                    @click="
                        () => {
                            if (item.type === 'directory') {
                                go(item.path);
                            } else {
                                download(item.path);
                            }
                        }
                    "
                    :class="[
                        'p:16',
                        'm:8',
                        'cursor:pointer',
                        'f:20',
                        item.type === 'directory' ? 'color:fuchsia-60 bl:6|double|fuchsia-60' : '',
                    ]"
                >
                    {{ item.name }}
                    <span
                        class="color:red-60 float:right"
                        @click="
                            (event) => {
                                event.stopPropagation();
                                remove(item.path);
                            }
                        "
                        >Remove</span
                    >
                </div>
            </div>
        </transition>
    </div>
</template>

<style>
html,
body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
}
</style>
