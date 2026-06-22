import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pin the tracing root to this project (silences the multi-lockfile warning).
  outputFileTracingRoot: __dirname,
};
export default nextConfig;
