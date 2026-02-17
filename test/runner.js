import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { run } from 'node:test';
import { tap } from 'node:test/reporters';

const concurrency = 3;
const timeout = 1000 * 60 * 10;

const dirs = [
  'autopilotrpc-integration',
  'chainrpc-integration',
  'integration',
  'invoicesrpc-integration',
  'peersrpc-integration',
  'routerrpc-integration',
  'signerrpc-integration',
  'tower_clientrpc-integration',
  'tower_serverrpc-integration',
  'versionrpc-integration',
  'walletrpc-integration',
];

const asPath = file => join(file.path || file.parentPath, file.name);
const flatten = arr => [].concat(...arr);

const files = flatten(dirs.map(dir => {
  return readdirSync(join(dirname(fileURLToPath(import.meta.url)), dir), {withFileTypes: true}).map(asPath);
}));

run({concurrency, files, timeout}).compose(tap).pipe(process.stdout);
