import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * This app is one package in a pnpm workspace, and its dependencies are
   * linked from the workspace root's node_modules/.pnpm store. Turbopack will
   * not resolve files above its project root, so the root is pinned to the
   * workspace rather than left to lockfile auto-detection.
   */
  turbopack: {
    root: path.join(__dirname, '..'),
  },

  /*
   * @nayaro/shared is used for types only (via the tsconfig `paths` entry), so
   * the web build never needs packages/shared/dist — which is git-ignored and
   * not built on Vercel.
   */

  typedRoutes: true,
};

export default nextConfig;
