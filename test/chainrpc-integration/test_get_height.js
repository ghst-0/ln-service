import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import { getHeight } from 'lightning';

const confirmationCount = 6;
const interval = 100;
const times = 100;

// Get height should return height
test(`Get height`, async () => {
  const {nodes} = await spawnLightningCluster({});

  const [{generate, kill, lnd}] = nodes;

  const startHeight = (await getHeight({lnd})).current_block_height;

  await asyncRetry({interval, times}, async () => {
    await generate({});

    const endHeight = (await getHeight({lnd})).current_block_height;

    if (endHeight - startHeight < confirmationCount) {
      throw new Error('ExpectedHeightIncreaseReflected');
    }

    strictEqual(
      endHeight - startHeight >= confirmationCount,
      true,
      'Got height'
    );
  });

  await kill({});
});
