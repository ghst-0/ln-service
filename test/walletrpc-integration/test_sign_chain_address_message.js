import test from 'node:test';
import { equal } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { createChainAddress, signChainAddressMessage } from 'lightning';

const message = 'message';

// Signing a chain address message should result in a signature
test(`Sign chain address message`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  const {address} = await createChainAddress({lnd});

  try {
    const {signature} = await signChainAddressMessage({address, lnd, message});

    equal(!!signature, true, 'Got a signature for a chain address');
  } catch {
    equal(message, 'BackingLndDoesNotSupportSigningChainMessages', 'missing');
  }

  await kill({});
});
