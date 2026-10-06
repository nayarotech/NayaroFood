/**
 * Builds a self-contained backend for cPanel ("Setup Node.js App" / Passenger).
 *
 *   pnpm --filter ./backend build:deploy   →   ../../backend.zip
 *
 * The workspace package @nayaro/shared cannot be installed by npm on the
 * server, so it is bundled into the output. Everything else stays a normal
 * npm dependency, installed on the server with "Run NPM Install".
 *
 * Output is CommonJS because Passenger loads the startup file with require().
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(backendDir, 'deploy');
// Beside the project folder, never inside it — the zip holds live secrets.
const zipPath = path.resolve(backendDir, '..', '..', 'backend.zip');
const require = createRequire(path.join(backendDir, 'package.json'));

const pkg = JSON.parse(readFileSync(path.join(backendDir, 'package.json'), 'utf8'));
const runtimeDeps = Object.keys(pkg.dependencies).filter((name) => name !== '@nayaro/shared');

/** Pin the exact versions we built and tested against. */
function installedVersion(name) {
  let dir = path.dirname(require.resolve(name));
  while (!existsSync(path.join(dir, 'package.json')) || JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot find package.json for ${name}`);
    dir = parent;
  }
  return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
}

console.log('› Cleaning', path.relative(process.cwd(), outDir));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log('› Bundling server, migrate and create-admin');
await build({
  entryPoints: {
    server: path.join(backendDir, 'src/server.ts'),
    migrate: path.join(backendDir, 'src/db/migrate.ts'),
    'create-admin': path.join(backendDir, 'src/db/create-admin.ts'),
  },
  outdir: outDir,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: 'linked',
  external: runtimeDeps,
  logLevel: 'warning',
  legalComments: 'none',
  // Runs before any require(): an old Node (cPanel often defaults to 10) would
  // otherwise crash deep inside a dependency with a baffling SyntaxError.
  // Written in syntax that even Node 10 can parse.
  banner: {
    js: `if (Number(process.versions.node.split('.')[0]) < 20) { console.error('\\n✗ Node.js ' + process.versions.node + ' is too old. This app needs Node.js 20 or newer.\\n  In cPanel → Setup Node.js App, set the Node.js version to 20+, Run NPM Install,\\n  and activate the matching environment (…/nodevenv/<app>/20/bin/activate).\\n'); process.exit(1); }`,
  },
});

console.log('› Copying migrations');
cpSync(path.join(backendDir, 'drizzle'), path.join(outDir, 'drizzle'), { recursive: true });
mkdirSync(path.join(outDir, 'uploads'), { recursive: true });
writeFileSync(path.join(outDir, 'uploads', '.gitkeep'), '');

console.log('› Writing package.json');
const deployPkg = {
  name: 'nayaro-food-api',
  version: pkg.version,
  private: true,
  description: 'Nayaro Food Delivery API — production build',
  main: 'server.js',
  engines: { node: '>=20.9.0' },
  scripts: {
    start: 'node server.js',
    migrate: 'node migrate.js',
    'create-admin': 'node create-admin.js',
  },
  dependencies: Object.fromEntries(runtimeDeps.sort().map((name) => [name, installedVersion(name)])),
};
writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(deployPkg, null, 2)}\n`);

console.log('› Generating fresh production secrets');
const webpush = require('web-push');
const vapid = webpush.generateVAPIDKeys();
const secret = () => randomBytes(48).toString('base64');
const env = readFileSync(path.join(backendDir, 'scripts', 'env.production.template'), 'utf8')
  .replace('__JWT_ACCESS_SECRET__', secret())
  .replace('__JWT_REFRESH_SECRET__', secret())
  .replace('__VAPID_PUBLIC_KEY__', vapid.publicKey)
  .replace('__VAPID_PRIVATE_KEY__', vapid.privateKey);
writeFileSync(path.join(outDir, '.env'), env, { mode: 0o600 });

cpSync(path.join(backendDir, 'scripts', 'DEPLOY-CPANEL.md'), path.join(outDir, 'DEPLOY-CPANEL.md'));

console.log('› Zipping →', zipPath);
rmSync(zipPath, { force: true });
// -X: no Mac extended attributes; -r: recursive; includes the .env dotfile.
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '*.DS_Store'], { cwd: outDir });

console.log(`\n✓ ${zipPath}`);
console.log('  Contains production secrets — do not commit or share it.');
