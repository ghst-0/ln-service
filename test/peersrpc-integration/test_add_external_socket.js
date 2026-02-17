import test from 'node:test';
import { deepEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { addExternalSocket, getWalletInfo } from 'lightning';

const socket = '192.168.0.1:12345';

// Adding a node socket should result in an updated advertised socket
test(`Add external socket`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{id, lnd}] = nodes;

  const additional = `${id}@${socket}`;

  try {
    const {uris} = await getWalletInfo({lnd});

    const [existing] = uris;

    await addExternalSocket({lnd, socket});

    const updated = await getWalletInfo({lnd});

    deepEqual(updated.uris, [existing, additional], 'Added new socket');
  } catch (err) {
    deepEqual(err, [400, 'ExpectedPeersRpcLndBuildTagToAddSocket']);
  }

  await kill({});
});
