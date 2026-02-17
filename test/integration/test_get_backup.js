import test from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';

import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { getBackup, verifyBackup } from 'lightning';

const size = 2;

// Getting a channel backup should return a channel backup
test(`Get channel backup`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  const channel = await setupChannel({generate, lnd, to: target});

  const {backup} = await getBackup({
    lnd,
    transaction_id: channel.transaction_id,
    transaction_vout: channel.transaction_vout,
  });

  deepStrictEqual(!!backup, true, 'Channel backup is returned');

  const channelBackup = await verifyBackup({
    backup,
    lnd,
    transaction_id: channel.transaction_id,
    transaction_vout: channel.transaction_vout,
  });

  deepStrictEqual(channelBackup.is_valid, true, 'Is a valid backup');

  await kill({});
});
