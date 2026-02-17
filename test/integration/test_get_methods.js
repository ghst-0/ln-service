import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getMethods } from 'lightning';

const {isArray} = Array;

// Getting LND methods should result in LND methods returned
test(`Get LND methods`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  const {methods} = await getMethods({lnd});

  const [method] = methods;

  strictEqual(typeof method.endpoint, 'string', 'Has endpoint path');
  strictEqual(isArray(method.permissions), true, 'Has array of permissions');

  const [permission] = method.permissions;

  strictEqual(typeof permission, 'string', 'Has permission');

  await kill({});
});
