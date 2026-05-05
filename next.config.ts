import type { NextConfig } from "next";

const NODE_ONLY_PKGS = [
  "pg-boss",
  "pg",
  "pg-pool",
  "pg-types",
  "pg-int8",
  "pg-connection-string",
  "pgpass",
  "pg-native",
  "pino",
  "pino-pretty",
  "pdf-parse",
  "archiver",
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: NODE_ONLY_PKGS,
  webpack(config, { isServer }) {
    config.resolve.alias.canvas = false;

    if (isServer) {
      // Mark Node.js-only packages AND built-ins as external for ALL server builds.
      // On edge the register() function returns early (NEXT_RUNTIME !== 'nodejs'),
      // so these requires are dead code and never execute.
      const NODE_BUILTINS = new Set([
        "fs", "fs/promises", "path", "os", "stream", "http", "https", "url",
        "util", "events", "buffer", "crypto", "net", "tls", "child_process",
        "dns", "readline", "zlib", "querystring", "timers", "timers/promises",
        "assert", "http2", "perf_hooks", "v8", "worker_threads", "string_decoder",
        "module", "process",
      ]);

      const prev = Array.isArray(config.externals)
        ? config.externals
        : config.externals
        ? [config.externals]
        : [];

      config.externals = [
        ...prev,
        (
          { request }: { request?: string },
          callback: (err: null, result?: string) => void
        ) => {
          if (!request) return callback(null);
          const isNodeBuiltin = NODE_BUILTINS.has(request) || request.startsWith("node:");
          const isNodeOnlyPkg = NODE_ONLY_PKGS.some(
            (pkg) => request === pkg || request.startsWith(pkg + "/")
          );
          if (isNodeBuiltin || isNodeOnlyPkg) {
            return callback(null, `commonjs ${request}`);
          }
          callback(null);
        },
      ];
    }

    return config;
  },
};

export default nextConfig;
