import test from 'node:test';
import { deepEqual, equal, ok } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getConfiguration, getWalletInfo } from 'lightning';

// Getting the configuration info should return info about the config
test(`Get configuration info`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  try {
    const {log, options} = await getConfiguration({lnd});

    ok(log.length > 0, 'Got the log lines');

    const color = options.find(n => n.type === 'color').value.toLowerCase();

    equal(color, (await getWalletInfo({lnd})).color, 'Got color from config');

    await kill({});
  } catch (err) {
    await kill({});

    deepEqual(err, [501, 'GetDebugConfigurationInfoNotSupported'], '404');
  }
});
