# File Sharing Server

A Secured Temporary File Sharing Server runs on GitHub Actions.

## Features

- [x] Fast
  - [x] Zero Configuration
  - [x] One-Click Start
- [x] Secure
  - [x] HTTPS / WSS
  - [x] Path Traversal Protection

## How

A Node.js file server with [cloudflared tunnel](https://try.cloudflare.com/).

## Usage

1. [Fork](https://github.com/JacobLinCool/GitHub-File-Sharing/fork).
2. Go to [Action](./workflows/file-sharing.yml), click `Run workflow`.
3. Find something like `https://some-random-words.trycloudflare.com` in the output of `Start Server` step.
4. Access the url and start sharing!
