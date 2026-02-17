import test from 'node:test';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import { addPeer, cancelPendingChannel, openChannels } from 'lightning';

const capacity = 1e6;
const count = 100;
const delay = n => new Promise(resolve => {setTimeout(resolve, n)});
const interval = 100;
const race = promises => Promise.race(promises);
const size = 2;
const timeout = 1000 * 5;
const times = 200;

// Cancel a channel should result in no pending channels
test(`Cancel pending channel`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  await generate({count});

  const channels = [{capacity, partner_public_key: target.id}];

  await asyncRetry({interval, times}, async () => {
    await addPeer({lnd, public_key: target.id, socket: target.socket});

    const toCancel = await race([
      delay(timeout),
      openChannels({channels, lnd}),
    ]);

    const [{id}] = toCancel.pending;

    await cancelPendingChannel({id, lnd});
  });

  await kill({});
});
