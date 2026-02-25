import * as esbuild from 'esbuild';
import { cpSync, realpathSync, existsSync, lstatSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Copy node-pty (native module) to native-deps/ so it's included in the VSIX
// without relying on node_modules symlink resolution.
const nodePtyLink = join(__dirname, 'node_modules', 'node-pty');
const nodePtyReal = realpathSync(nodePtyLink);
const nativeDepsDir = join(__dirname, 'native-deps', 'node-pty');
rmSync(join(__dirname, 'native-deps'), { recursive: true, force: true });
cpSync(nodePtyReal, nativeDepsDir, { recursive: true, dereference: true });
console.log(`Copied node-pty → native-deps/node-pty`);

await esbuild.build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    // vscode is provided by the host; node-pty is redirected to native-deps/ below
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: false,
    plugins: [
        {
            // Redirect require('node-pty') → require('../native-deps/node-pty')
            // so the bundled extension.js loads from native-deps/ relative to out/
            name: 'node-pty-native',
            setup(build) {
                build.onResolve({ filter: /^node-pty$/ }, () => ({
                    path: '../native-deps/node-pty',
                    external: true,
                }));
            },
        },
    ],
});

console.log('Extension bundled.');
