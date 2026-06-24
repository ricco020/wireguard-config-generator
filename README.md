# WireGuard Config Generator

A free, open-source **WireGuard** configuration generator that runs **entirely in your browser**. It produces a ready-to-use server `wg0.conf` and one or more client `.conf` files, with real Curve25519 (X25519) keypairs — and **never sends a single key to a server**.

It is a single self-contained `index.html` with **zero runtime dependencies**: no build step, no npm install, no CDN. Open the file locally (or use the hosted demo) and it just works, even offline.

## What it does

- Generates a **WireGuard server config** (`[Interface]` + one `[Peer]` per client).
- Generates **N client configs** (1–10), each with its own keypair, preshared key and tunnel IP.
- Real **Curve25519 / X25519** keypair generation (RFC 7748), the same key type WireGuard uses. The implementation is verified against the official RFC 7748 test vectors.
- Per-peer **preshared keys** (`PresharedKey`) for an extra symmetric layer.
- **Full-tunnel** (`AllowedIPs = 0.0.0.0/0, ::/0`) or **split-tunnel** routing.
- Configurable endpoint, listen port, tunnel subnet (CIDR) and client DNS.
- **Copy to clipboard** and **download** each file, or **download all** at once.

## Privacy

All cryptography runs locally using the browser's Web Crypto RNG (`crypto.getRandomValues`). Private keys are created in your tab and are **never transmitted, logged or stored**. Because the whole tool is one static HTML file, you can read every line of what it does.

## How to use it

1. Open `index.html` in any modern browser (or use the hosted version below).
2. Fill in your server's public IP / hostname, listen port, tunnel subnet and DNS.
3. Pick the number of clients and full- vs split-tunnel routing.
4. Click **Generate configuration**.
5. **Server:** save `wg0.conf` to `/etc/wireguard/wg0.conf` on your server and start it with `wg-quick up wg0`.
6. **Clients:** import each `client*.conf` into the WireGuard app (desktop or mobile).

> Generated configs are standard WireGuard files. Review them before use, adjust the `eth0` interface name in the `PostUp`/`PostDown` NAT rules to match your server's WAN interface, and keep your private keys secret.

## Run locally

No tooling required:

```sh
git clone https://github.com/ricco020/wireguard-config-generator.git
cd wireguard-config-generator
# open index.html in your browser, or serve it:
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Hosted version

A hosted, ad-free version with a field-by-field tutorial is available here:

**https://vpnsmith.com/en/tools/wireguard-config-generator**

## Tech notes

- X25519 scalar multiplication is a dependency-free port of the public-domain TweetNaCl reference field arithmetic, validated against RFC 7748 §5.2 / §6.1 test vectors.
- Keys are clamped per RFC 7748 and Base64-encoded exactly as WireGuard expects.
- The UI builds all dynamic content with `textContent` / `createElement` (no `innerHTML`).

## License

[MIT](./LICENSE)
