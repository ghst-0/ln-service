import test from 'node:test';
import { equal } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getPublicKey, getWalletInfo } from 'lightning';

const identityKeyFamily = 6;

// Getting a public key out of the seed should return the raw public key
test(`Get public key`, async () => {
  const [{kill, lnd}] = (await spawnLightningCluster({})).nodes;

  const key = await getPublicKey({
    lnd,
    family: identityKeyFamily,
    index: [].length,
  });

  const wallet = await getWalletInfo({lnd});

  equal(wallet.public_key, key.public_key, 'Derive identity public key');

  await kill({});
});
