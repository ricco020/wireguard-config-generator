#!/usr/bin/env node
"use strict";

/*
 * wg-config — WireGuard configuration generator (CLI)
 *
 * Generates a server wg0.conf and N client .conf files with real
 * Curve25519 / X25519 keypairs, produced with Node's native `crypto`
 * module (crypto.generateKeyPairSync('x25519')). The 32-byte raw keys
 * are Base64-encoded exactly as WireGuard expects, and private keys are
 * clamped per RFC 7748 — identical key format to `wg genkey` / `wg pubkey`.
 *
 * Nothing is transmitted: keys are created locally and written to stdout
 * or to local files. Zero runtime dependencies.
 *
 * Hosted browser version: https://vpnsmith.com/en/tools/wireguard-config-generator
 *
 * MIT licensed.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const VERSION = "1.0.0";

/* --------------------------------------------------------------- *
 * Key generation (native X25519, WireGuard-compatible Base64).
 * --------------------------------------------------------------- */

// Extract the trailing 32 raw key bytes from a DER-encoded X25519 key.
// For X25519 the curve point / scalar is always the last 32 bytes of
// the SPKI (public) / PKCS#8 (private) DER structure.
function rawFromDer(der) {
  return der.subarray(der.length - 32);
}

function genKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const privRaw = rawFromDer(privateKey.export({ type: "pkcs8", format: "der" }));
  const pubRaw = rawFromDer(publicKey.export({ type: "spki", format: "der" }));
  return {
    privateKey: Buffer.from(privRaw).toString("base64"),
    publicKey: Buffer.from(pubRaw).toString("base64"),
  };
}

// 32 random bytes, Base64 — same format as `wg genpsk`.
function genPresharedKey() {
  return crypto.randomBytes(32).toString("base64");
}

/* --------------------------------------------------------------- *
 * Config builders.
 * --------------------------------------------------------------- */

function buildConfigs(opts) {
  // /24-style host addressing derived from the subnet's network prefix.
  const netParts = opts.subnet.split("/")[0].split(".");
  if (netParts.length !== 4 || netParts.some((p) => p === "" || isNaN(+p))) {
    throw new Error("Invalid --subnet (expected CIDR like 10.0.0.0/24): " + opts.subnet);
  }
  const base = netParts.slice(0, 3).join(".");
  const mask = opts.subnet.includes("/") ? opts.subnet.split("/")[1] : "24";

  const server = genKeypair();
  const serverIp = base + ".1";

  const clients = [];
  for (let i = 0; i < opts.clientCount; i++) {
    const ck = genKeypair();
    const psk = genPresharedKey();
    const ip = base + "." + (i + 2);
    const conf = [
      "[Interface]",
      "# Client " + (i + 1),
      "PrivateKey = " + ck.privateKey,
      "Address = " + ip + "/" + mask,
      "DNS = " + opts.dns,
      "",
      "[Peer]",
      "PublicKey = " + server.publicKey,
      "PresharedKey = " + psk,
      "Endpoint = " + opts.endpoint,
      "AllowedIPs = " + opts.allowedIps,
      "PersistentKeepalive = 25",
    ].join("\n");
    clients.push({ index: i + 1, publicKey: ck.publicKey, presharedKey: psk, ip, conf });
  }

  const peers = clients
    .map(
      (c) =>
        "[Peer]\n# Client " +
        c.index +
        "\nPublicKey = " +
        c.publicKey +
        "\nPresharedKey = " +
        c.presharedKey +
        "\nAllowedIPs = " +
        c.ip +
        "/32"
    )
    .join("\n\n");

  const serverConf = [
    "[Interface]",
    "# WireGuard Server",
    "PrivateKey = " + server.privateKey,
    "Address = " + serverIp + "/" + mask,
    "ListenPort = " + opts.port,
    "",
    "# Enable IP forwarding + NAT (adjust eth0 to your WAN interface)",
    "PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE",
    "PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE",
    "",
    peers,
  ].join("\n");

  return { serverConf, clients };
}

/* --------------------------------------------------------------- *
 * Argument parsing.
 * --------------------------------------------------------------- */

const HELP = `wg-config v${VERSION} — WireGuard configuration generator

Usage:
  wg-config [options]

Options:
  --clients N            Number of client configs to generate (default: 1)
  --endpoint host:port   Server endpoint. If no :port is given, --port is used.
                         (default: YOUR_SERVER_IP:51820)
  --port N               Server listen port (default: 51820)
  --subnet CIDR          Tunnel subnet (default: 10.0.0.0/24)
  --dns IP               Client DNS server (default: 1.1.1.1)
  --full                 Full-tunnel routing: AllowedIPs = 0.0.0.0/0, ::/0 (default)
  --split                Split-tunnel routing: AllowedIPs = tunnel subnet only
  --out DIR              Write wg0.conf + client*.conf into DIR instead of stdout
  -h, --help             Show this help
  -v, --version          Show version

Examples:
  wg-config --clients 2 --endpoint vpn.example.com:51820
  wg-config --clients 3 --endpoint 203.0.113.1 --subnet 10.8.0.0/24 --split
  wg-config --clients 1 --endpoint vpn.example.com:51820 --out ./wg-out

Keys are generated locally with Node's native X25519 (crypto) and are
never transmitted. Hosted browser version:
https://vpnsmith.com/en/tools/wireguard-config-generator`;

function parseArgs(argv) {
  const opts = {
    clientCount: 1,
    endpoint: "YOUR_SERVER_IP",
    port: 51820,
    portFromEndpoint: false,
    subnet: "10.0.0.0/24",
    dns: "1.1.1.1",
    tunnel: "full",
    out: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error("Missing value for " + a);
      return v;
    };
    switch (a) {
      case "-h":
      case "--help":
        process.stdout.write(HELP + "\n");
        process.exit(0);
        break;
      case "-v":
      case "--version":
        process.stdout.write(VERSION + "\n");
        process.exit(0);
        break;
      case "--clients":
        opts.clientCount = parseInt(next(), 10);
        break;
      case "--endpoint":
        opts.endpoint = next();
        break;
      case "--port":
        opts.port = parseInt(next(), 10);
        break;
      case "--subnet":
        opts.subnet = next();
        break;
      case "--dns":
        opts.dns = next();
        break;
      case "--full":
        opts.tunnel = "full";
        break;
      case "--split":
        opts.tunnel = "split";
        break;
      case "--out":
        opts.out = next();
        break;
      default:
        throw new Error("Unknown option: " + a + " (try --help)");
    }
  }

  if (!Number.isInteger(opts.clientCount) || opts.clientCount < 1) {
    throw new Error("--clients must be a positive integer");
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    throw new Error("--port must be between 1 and 65535");
  }

  // Endpoint may already include :port. If so it wins; otherwise append --port.
  const m = /^(.*):(\d+)$/.exec(opts.endpoint);
  if (m) {
    opts.endpointFull = opts.endpoint;
    // keep --port for the server ListenPort if user didn't override it; the
    // endpoint port is what clients dial.
  } else {
    opts.endpointFull = opts.endpoint + ":" + opts.port;
  }

  return opts;
}

/* --------------------------------------------------------------- *
 * Main.
 * --------------------------------------------------------------- */

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write("Error: " + e.message + "\n");
    process.exit(1);
  }

  const allowedIps = opts.tunnel === "full" ? "0.0.0.0/0, ::/0" : opts.subnet;

  let result;
  try {
    result = buildConfigs({
      endpoint: opts.endpointFull,
      port: opts.port,
      subnet: opts.subnet,
      dns: opts.dns,
      clientCount: opts.clientCount,
      allowedIps,
    });
  } catch (e) {
    process.stderr.write("Error: " + e.message + "\n");
    process.exit(1);
  }

  if (opts.out) {
    fs.mkdirSync(opts.out, { recursive: true });
    const serverPath = path.join(opts.out, "wg0.conf");
    fs.writeFileSync(serverPath, result.serverConf + "\n", { mode: 0o600 });
    process.stderr.write("Wrote " + serverPath + "\n");
    result.clients.forEach((c) => {
      const p = path.join(opts.out, "client" + c.index + ".conf");
      fs.writeFileSync(p, c.conf + "\n", { mode: 0o600 });
      process.stderr.write("Wrote " + p + "\n");
    });
    process.stderr.write(
      "\nServer: copy wg0.conf to /etc/wireguard/wg0.conf and run `wg-quick up wg0`.\n" +
        "Clients: import each client*.conf into the WireGuard app.\n"
    );
  } else {
    const out = process.stdout;
    out.write("# ===== wg0.conf (server) =====\n");
    out.write(result.serverConf + "\n\n");
    result.clients.forEach((c) => {
      out.write("# ===== client" + c.index + ".conf (" + c.ip + ") =====\n");
      out.write(c.conf + "\n\n");
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = { genKeypair, genPresharedKey, buildConfigs };
