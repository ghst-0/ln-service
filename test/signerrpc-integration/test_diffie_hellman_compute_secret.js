import test from 'node:test';
import { deepEqual,equal } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { diffieHellmanComputeSecret } from 'lightning';

const all = promise => Promise.all(promise);
const size = 2;

// Computing a shared secret should return the shared secret
test('Diffie Hellman compute secret', async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{id, lnd}, target] = nodes;

  try {
    const [control, {secret}] = await all([
      diffieHellmanComputeSecret({lnd, partner_public_key: target.id}),
      diffieHellmanComputeSecret({lnd: target.lnd, partner_public_key: id}),
    ]);

    equal(control.secret.length, 64, 'Got key back');
    equal(control.secret, secret, 'Key exchange is done');
  } catch (err) {
    deepEqual(
      err,
      [400, 'ExpectedLndWithSupportForDeriveSharedKey'],
      'Got err'
    );
  }

  await kill({});
});
