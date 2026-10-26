# WireGuard Config Generator

A free, open-source **WireGuard** configuration generator that runs **entirely in your browser**. It produces a ready-to-use server `wg0.conf` and one or more client `.conf` files, with real Curve25519 (X25519) keypairs, and it **never sends a single key to a server**.

It ships in two forms with **zero runtime dependencies**:

- a single self-contained `index.html` (no build step, no CDN) that runs in any browser, even offline; and
- a **Node CLI** (`wg-config`) that generates the same configs from the terminal using Node's native X25519 (`crypto`).

## What it does

- Generates a **WireGuard server config** (`[Interface]` + one `[Peer]` per client).
- Generates **N client configs** (1 to 10), each with its own keypair, preshared key and tunnel IP.
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

## CLI

The package also ships a Node CLI that generates the same server + client
configs from the terminal. Keys are produced with Node's **native X25519**
(`crypto.generateKeyPairSync('x25519')`), clamped per RFC 7748 and Base64-encoded
exactly as WireGuard expects; nothing is transmitted.

Install globally:

```sh
npm install -g wg-config-generator
```

Usage:

```sh
# Print a server wg0.conf + 2 client configs to stdout
wg-config --clients 2 --endpoint vpn.example.com:51820

# Split-tunnel, custom subnet and DNS
wg-config --clients 3 --endpoint 203.0.113.1 --port 51820 --subnet 10.8.0.0/24 --dns 9.9.9.9 --split

# Write wg0.conf + client*.conf into a directory (files created with 0600)
wg-config --clients 1 --endpoint vpn.example.com:51820 --out ./wg-out
```

Options:

| Option | Description | Default |
| --- | --- | --- |
| `--clients N` | Number of client configs to generate | `1` |
| `--endpoint host:port` | Server endpoint clients dial (port optional; falls back to `--port`) | `YOUR_SERVER_IP:51820` |
| `--port N` | Server listen port | `51820` |
| `--subnet CIDR` | Tunnel subnet | `10.0.0.0/24` |
| `--dns IP` | Client DNS server | `1.1.1.1` |
| `--full` / `--split` | Full-tunnel (`0.0.0.0/0, ::/0`) or split-tunnel routing | `--full` |
| `--out DIR` | Write files into `DIR` instead of stdout | stdout |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

Requires Node.js **>= 18**.

## Run the browser tool locally

No tooling required:

```sh
git clone https://github.com/ricco020/wireguard-config-generator.git
cd wireguard-config-generator
# open index.html in your browser, or serve it:
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Hosted version

A hosted, ad-free version with a field-by-field tutorial is available here:

**[vpnsmith.com/en/tools/wireguard-config-generator](https://www.vpnsmith.com/en/tools/wireguard-config-generator?src=github&ref=gh-wgcg)**

## Before you generate: the server side

The configs only work if clients can reach the server's `ListenPort` over UDP. That means a machine with a **public IPv4 address** and an open UDP port. A home connection behind CGNAT (common on 4G/5G boxes and many fibre ISPs) cannot accept inbound WireGuard, whatever the config says.

- Not sure if you are behind CGNAT? [WireGuard behind CGNAT: why it fails and how to fix it](https://www.vpnsmith.com/en/blog/wireguard-behind-cgnat?src=github&ref=gh-wgcg)
- Renting a small VPS for it: [step-by-step WireGuard on a Contabo VPS](https://www.vpnsmith.com/en/blog/self-host-vpn-contabo-wireguard-2026?src=github&ref=gh-wgcg) (covers firewall, IP forwarding and NAT rules for the `wg0.conf` this tool produces)

## Troubleshooting the generated configs

| Symptom after `wg-quick up` | Usual cause | Guide |
| --- | --- | --- |
| `Handshake did not complete after 5 seconds` | Blocked UDP port, wrong endpoint, swapped public keys | [8 causes, checked in order](https://www.vpnsmith.com/en/blog/wireguard-handshake-troubleshooting-2026?src=github&ref=gh-wgcg) |
| Tunnel up, some sites hang or time out | MTU too high on PPPoE, 4G or nested tunnels | [MTU 1420 vs 1280](https://www.vpnsmith.com/en/blog/wireguard-mtu-fix-2026?src=github&ref=gh-wgcg) |
| Connection drops after a few idle minutes | NAT mapping expires on the client side | [PersistentKeepalive = 25](https://www.vpnsmith.com/en/blog/wireguard-persistent-keepalive-2026?src=github&ref=gh-wgcg) |
| `wg-quick: line 32: resolvconf: command not found` | `DNS =` line on a system without resolvconf | [resolvconf fix](https://www.vpnsmith.com/en/blog/wireguard-resolvconf-not-found-2026?src=github&ref=gh-wgcg) |
| Works on LAN, never from outside | Server behind CGNAT or no port forward | [CGNAT guide](https://www.vpnsmith.com/en/blog/wireguard-behind-cgnat?src=github&ref=gh-wgcg) |

## Tech notes

- X25519 scalar multiplication is a dependency-free port of the public-domain TweetNaCl reference field arithmetic, validated against RFC 7748 sections 5.2 and 6.1 test vectors.
- Keys are clamped per RFC 7748 and Base64-encoded exactly as WireGuard expects.
- The UI builds all dynamic content with `textContent` / `createElement` (no `innerHTML`).

## License

[MIT](./LICENSE)
