import test from 'node:test';
import { strictEqual, fail } from 'node:assert/strict';
import { exit } from 'node:process';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getWalletInfo, stopDaemon } from 'lightning';

// Stopping the daemon should gracefully shut down the daemon
test(`Stop daemon`, async t => {
  const [{kill, lnd}] = (await spawnLightningCluster({})).nodes;

  t.after(() => exit());

  await stopDaemon({lnd});

  try {
    const walletInfo = await getWalletInfo({lnd});

    fail('Daemon should be offline');
  } catch (err) {
    const [code, message] = err;

    strictEqual(code, 503, 'Error code indicates daemon offline');
    strictEqual(message, 'FailedToConnectToDaemon', 'Error indicates offline');
  }

  await kill({});
});
