import test from 'node:test';
import { deepEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getWalletInfo, removeExternalSocket } from 'lightning';

// Removing a node socket should result in a no longer advertised socket
test(`Add external socket`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  try {
    const {uris} = await getWalletInfo({lnd});

    const [uri] = uris;

    const [, socket] = uri.split('@');

    await removeExternalSocket({lnd, socket});

    const updated = await getWalletInfo({lnd});

    deepEqual(updated.uris, [], 'External socket removed');
  } catch (err) {
    deepEqual(err, [400, 'ExpectedPeersRpcLndBuildTagToRemoveSocket']);
  }

  await kill({});
});
