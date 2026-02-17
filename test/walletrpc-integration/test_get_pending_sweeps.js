import test from 'node:test';
import { equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  closeChannel,
  getClosedChannels,
  getPendingSweeps,
  getWalletInfo
} from 'lightning';

const blockDelay = 50;
const give = 1e5;
const interval = 50;
const size = 2;
const times = 10000;

// Force close a channel and get the resulting pending sweeps
test(`Get pending sweeps`, async t => {
  const {kill, nodes} = await spawnLightningCluster({size});

  t.after(() => exit());

  const [{generate, lnd}, target] = nodes;

  await asyncRetry({interval, times}, async () => {
    const wallet = await getWalletInfo({lnd});

    await generate({});

    if (!wallet.is_synced_to_chain) {
      throw new Error('NotSyncedToChain');
    }
  });

  const channel = await setupChannel({
    generate,
    lnd,
    give_tokens: give,
    partner_csv_delay: blockDelay,
    to: target,
  });

  const closing = await closeChannel({
    lnd,
    is_force_close: true,
    transaction_id: channel.transaction_id,
    transaction_vout: channel.transaction_vout,
  });

  await asyncRetry({interval, times}, async () => {
    await generate({});

    if (!!(await getClosedChannels({lnd})).channels.length) {
      return;
    }

    throw new Error('ExpectedClosedChannel');
  });

  const {sweeps} = await getPendingSweeps({lnd});

  const [sweep] = sweeps;

  equal(sweep.transaction_id, closing.transaction_id, 'Got closing sweep');

  await kill({});
});
