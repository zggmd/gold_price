/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a minimal self-contained server in .next/standalone for lean images.
  output: 'standalone',

  // better-sqlite3 is a native addon; keep it external so Next never tries to
  // bundle the .node binary into the server chunk.
  serverExternalPackages: ['better-sqlite3'],

  // Make sure the compiled native binding ships with the standalone output.
  outputFileTracingIncludes: {
    '/': ['./node_modules/better-sqlite3/build/Release/better_sqlite3.node'],
  },
};

export default nextConfig;
