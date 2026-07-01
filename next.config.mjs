/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a minimal self-contained server in .next/standalone for lean images.
  output: 'standalone',

  // better-sqlite3 is a native addon; keep it external so Next never tries to
  // bundle the .node binary into the server chunk. Applies to App Router routes.
  serverExternalPackages: ['better-sqlite3'],

  // Make sure the compiled native binding ships with the standalone output.
  outputFileTracingIncludes: {
    '/': ['./node_modules/better-sqlite3/build/Release/better_sqlite3.node'],
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // `serverExternalPackages` covers App Router routes/components, but
      // `next dev` ALSO eagerly compiles instrumentation.ts, and that compile
      // pass does not inherit the externals list — so webpack would otherwise
      // try to bundle better-sqlite3 → bindings → `fs` and fail with
      // "Module not found: Can't resolve 'fs'". Force the native addon (and its
      // `bindings` loader helper) external on the server in every pass.
      const externals = Array.isArray(config.externals)
        ? config.externals
        : [config.externals].filter(Boolean);
      externals.push('better-sqlite3', 'bindings');
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
