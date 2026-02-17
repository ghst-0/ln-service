import test from 'node:test';
import { equal } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { signMessage, verifyMessage } from 'lightning';

const message = 'message';

// Sign message should return a signature for the message
test(`Sign message`, async () => {
  const [{id, kill, lnd}] = (await spawnLightningCluster({})).nodes;

  const {signature} = await signMessage({lnd, message});

  const verified = await verifyMessage({lnd, message, signature});

  equal(verified.signed_by, id, 'Signature is verified');

  await kill({});
});
