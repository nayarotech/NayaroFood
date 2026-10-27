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
   * Shared types use the tsconfig paths entry. The option-pricing engine is
   * imported directly from source via lib/menu-options, so web builds do not
   * require packages/shared/dist.
   */

  typedRoutes: true,
};

export default nextConfig;
