import test from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  createInvoice,
  getSettlementStatus,
  pay
} from 'lightning';

const fakeChannelId = '1x1x1';
const interval = 100;
const size = 2;
const times = 2000;
const tokens = 100;

// Get the settlement status of an HTLC
test(`Get settlement status`, async () => {
  // LND 0.15.5 and below do not support settlement status lookups
  {
    const {kill, nodes} = await spawnLightningCluster({});

    const [{lnd}] = nodes;

    try {
      await getSettlementStatus({
        lnd,
        channel: fakeChannelId,
        payment: Number(),
      });

      await kill({});
    } catch (err) {
      const [code, message] = err;

      if (code !== 404) {
        equal(code, 501, 'Method unsupported');
        equal(message, 'LookupHtlcResolutionMethodUnsupported', 'Unsupported');

        await kill({});

        return;
      }
    }
  }

  const {kill, nodes} = await spawnLightningCluster({
    size,
    lnd_configuration: ['--store-final-htlc-resolutions'],
  });

  const [{generate, lnd}, target] = nodes;

  try {
    const channel = await setupChannel({generate, lnd, to: target});

    const {request} = await createInvoice({tokens, lnd: target.lnd});

    await pay({lnd, request});

    const settlement = await asyncRetry({interval, times}, async () => {
      return await getSettlementStatus({
        lnd: target.lnd,
        channel: channel.id,
        payment: Number(),
      });
    });

    deepStrictEqual(settlement, {is_onchain: false, is_settled: true}, 'Stat');
  } catch (err) {
    deepStrictEqual(err, null, 'Expected no error');
  }

  await kill({});
});
