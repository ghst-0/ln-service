import test from 'node:test';
import { deepEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getWalletInfo, updateAlias } from 'lightning';

const alias = 'alias';

// Updating a node alias should result in an updated alias
test(`Update alias`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  try {
    const {color} = await getWalletInfo({lnd});

    await updateAlias({alias, lnd});

    const updated = await getWalletInfo({lnd});

    deepEqual(updated.alias, alias, 'Alias was updated');
    deepEqual(updated.color, color, 'Color was not updated');
  } catch (err) {
    deepEqual(err, [400, 'ExpectedPeersRpcLndBuildTagToUpdateAlias']);
  }

  await kill({});
});
