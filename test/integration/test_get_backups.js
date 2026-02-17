import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { getBackups } from 'lightning';

const size = 2;

// Getting a set of channel backups should return channel backups
test(`Get channel backup`, async () => {
  await asyncRetry({}, async () => {
    const {kill, nodes} = await spawnLightningCluster({size});

    const [{generate, lnd}, target] = nodes;

    const channel = await setupChannel({generate, lnd, to: target});

    const {backup, channels} = await getBackups({lnd});

    strictEqual(!!backup, true, 'Multi-backup blob is returned');
    strictEqual(channels.length, [channel].length, 'Individualized backup');

    const [chanBackup] = channels;

    strictEqual(!!chanBackup.backup.length, true, 'Channel backup has blob');
    strictEqual(chanBackup.transaction_id, channel.transaction_id, 'Chan id');
    strictEqual(chanBackup.transaction_vout, channel.transaction_vout, 'Vout');

    await kill({});
  });
});
