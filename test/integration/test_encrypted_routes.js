import test from 'node:test';
import { strictEqual } from 'node:assert/strict';
import asyncRetry from 'async/retry.js';

import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  addPeer,
  createInvoice,
  pay
} from 'lightning';

const count = 100;
const expiry = () => new Date(Date.now() + (4 * 60 * 60 * 1000)).toISOString();
const give = 500000;
const interval = 100;
const size = 3;
const times = 10000;
const tokens = 100;

// Paying to an encrypted routes invoice should result in a payment
test(`Create an invoice`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target, remote] = nodes;

  await generate({count});

  try {
    await setupChannel({generate, lnd, give_tokens: give, to: target});

    await addPeer({lnd, public_key: remote.id, socket: remote.socket});

    await setupChannel({
      generate: target.generate,
      give_tokens: give,
      lnd: target.lnd,
      to: remote,
    });

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const invoice = await createInvoice({
        lnd,
        tokens,
        expires_at: expiry(),
        is_encrypting_routes: true,
      });

      await addPeer({lnd, public_key: remote.id, socket: remote.socket});

      await pay({lnd: remote.lnd, request: invoice.request});
    });

    await kill({});
  } catch (err) {
    await kill({});

    strictEqual(err, null, 'Expected no error in create invoice');
  }
});
