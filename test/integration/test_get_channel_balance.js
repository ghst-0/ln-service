import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getChannelBalance } from 'lightning';

const emptyBalance = 0;

// Getting channel balance should result in a channel balance
test(`Get the channel balance`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  const result = await getChannelBalance({lnd});

  strictEqual(result.channel_balance, emptyBalance, 'Valid channel balance');

  await kill({});
});
