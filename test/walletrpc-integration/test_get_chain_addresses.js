import test from 'node:test';
import { deepEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { createChainAddress, getChainAddresses } from 'lightning';

// Getting chain addresses should return a list of addresses
test(`Get chain addresses`, async () => {
  const [{kill, lnd}] = (await spawnLightningCluster({})).nodes;

  try {
    await getChainAddresses({lnd});
  } catch (err) {
    // LND 0.12.1 does not support getting locked UTXOs
    deepEqual(
      err,
      [501, 'BackingLndDoesNotSupportGettingChainAddresses'],
      'Got unsupported error'
    );

    await kill({});

    return;
  }

  try {
    const expected = [
      {
        address: (await createChainAddress({lnd, format: 'np2wpkh'})).address,
        is_change: false,
        tokens: 0,
      },
      {
        address: (await createChainAddress({lnd})).address,
        is_change: false,
        tokens: 0,
      },
      {
        address: (await createChainAddress({lnd, format: 'p2tr'})).address,
        is_change: false,
        tokens: 0,
      },
    ];

    const {addresses} = await getChainAddresses({lnd});

    deepEqual(addresses, expected, 'Got created chain addresses');
  } catch (err) {
    deepEqual(err, null, 'Expected no error');
  }

  await kill({});
});
