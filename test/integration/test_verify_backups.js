import test from 'node:test';
import { equal } from 'node:assert/strict';

import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { getBackups, verifyBackups } from 'lightning';

const size = 2;

// Verifying backups should show the backups are valid
test(`Test verify backups`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [control, target] = nodes;

  const {lnd} = control;

  const channelOpen = await setupChannel({
    lnd: target.lnd,
    generate: target.generate,
    to: control,
  });

  const {backup} = await getBackups({lnd});

  const goodBackup = await verifyBackups({
    backup,
    lnd,
    channels: [{
      transaction_id: channelOpen.transaction_id,
      transaction_vout: channelOpen.transaction_vout,
    }],
  });

  const badBackup = await verifyBackups({
    lnd,
    backup: backup.slice([backup, backup].length),
    channels: [{
      transaction_id: channelOpen.transaction_id,
      transaction_vout: channelOpen.transaction_vout,
    }],
  });

  equal(badBackup.is_valid, false, 'Invalid channels backup is invalid');
  equal(goodBackup.is_valid, true, 'Valid channels backup is validated');

  await kill({});
});
