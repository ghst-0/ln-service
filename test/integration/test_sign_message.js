import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { signMessage } from 'lightning';

const expectedSignatureLength = 104;
const message = 'message';

// Sign message should return a signature for the message
test(`Sign message`, async () => {
  const [{kill, lnd}] = (await spawnLightningCluster({})).nodes;

  const {signature} = await signMessage({lnd, message});

  strictEqual(signature.length, expectedSignatureLength, 'Signature returned');

  await kill({});
});
