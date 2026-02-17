import test from 'node:test';
import { deepEqual, equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { isDestinationPayable } from 'lightning';

const interval = 100;
const size = 2;
const times = 1000;
const tokens = 1e6 / 2;

// Determining if a route is payable should indicate if a route can be found
test('Is destination payable', async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  try {
    await asyncRetry({interval, times}, async () => {
      await setupChannel({generate, lnd, to: target});
    });

    const canPay = await isDestinationPayable({lnd, destination: target.id});

    deepEqual(canPay, {is_payable: true}, 'Can pay with default amount');

    const canPayTokens = await isDestinationPayable({
      lnd,
      tokens,
      destination: target.id,
    });

    deepEqual(canPayTokens, {is_payable: true}, 'Can pay with tokens amount');

    const canPayMtokens = await isDestinationPayable({
      lnd,
      mtokens: tokens,
      destination: target.id,
    });

    deepEqual(canPayMtokens, {is_payable: true}, 'Can pay with mtokens sum');
  } catch (err) {
    equal(err, null, 'Expected no error');
  }

  await kill({});
});
