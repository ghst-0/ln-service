import test from 'node:test';
import { deepEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getWalletInfo, updateColor } from 'lightning';

const color = '#666666'

// Updating a node color should result in an updated color
test(`Update color`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  try {
    const {alias} = await getWalletInfo({lnd});

    await updateColor({color, lnd});

    const updated = await getWalletInfo({lnd});

    deepEqual(updated.alias, alias, 'Alias was not updated');
    deepEqual(updated.color, color, 'Color was updated');
  } catch (err) {
    deepEqual(err, [400, 'ExpectedPeersRpcLndBuildTagToUpdateColor']);
  }

  await kill({});
});
