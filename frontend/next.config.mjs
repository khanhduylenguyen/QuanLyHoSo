import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cố định thư mục gốc, tránh Next nhận nhầm lockfile ở thư mục cha.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api',
  },
};

export default nextConfig;
