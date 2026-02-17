import test from 'node:test';
import { equal } from 'node:assert/strict';

import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { getBackup, verifyBackup } from 'lightning';

const size = 2;

// Verifying a channel backup should show the backup is valid
test(`Test verify backup`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [control, target] = nodes;

  const {lnd} = control;

  const channelOpen = await setupChannel({
    lnd: target.lnd,
    generate: target.generate,
    to: control,
  });

  const {backup} = await getBackup({
    lnd,
    transaction_id: channelOpen.transaction_id,
    transaction_vout: channelOpen.transaction_vout,
  });

  const goodBackup = await verifyBackup({
    backup,
    lnd,
    transaction_id: channelOpen.transaction_id,
    transaction_vout: channelOpen.transaction_vout,
  });

  const badBackup = await verifyBackup({
    lnd,
    backup: backup.slice([backup, backup].length),
    transaction_id: channelOpen.transaction_id,
    transaction_vout: channelOpen.transaction_vout,
  });

  equal(badBackup.is_valid, false, 'Invalid channel backup is invalid');
  equal(goodBackup.is_valid, true, 'Channel backup is validated');

  await kill({});
});
