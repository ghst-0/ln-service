import test from 'node:test';
import { deepEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  createInvoice,
  getPayment,
  getWalletInfo,
  payViaPaymentRequest,
  subscribeToForwards,
  subscribeToPastPayments
} from 'lightning';

const interval = 1000;
const size = 2;
const times = 1000;
const tokens = 100;

// Subscribing to past payments should notify on a payment
test(`Subscribe to past payment`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  try {
    const [{generate, lnd}, target] = nodes;

    const forwards = [];
    const payments = [];
    const sub = subscribeToPastPayments({lnd});
    const sub2 = subscribeToForwards({lnd});

    sub2.on('forward', forward => forwards.push(forward));
    sub.on('payment', payment => payments.push(payment));

    // Make sure that target is synced to the chain otherwise invoice can halt
    await asyncRetry({interval, times}, async () => {
      const wallet = await getWalletInfo({lnd: target.lnd});

      await generate({});

      if (!wallet.is_synced_to_chain) {
        throw new Error('WaitingForSyncToChain');
      }
    });

    const invoice = await createInvoice({tokens, lnd: target.lnd});

    const {id} = invoice;

    await setupChannel({generate, lnd, to: target});

    await payViaPaymentRequest({lnd, request: invoice.request});

    const {payment} = await getPayment({id, lnd});

    await asyncRetry({interval: 10, times: 1000}, async () => {
      if (forwards.length !== 2) {
        throw new Error('ExpectedForwardsEvents');
      }
    });

    const [got] = payments;

    const sent = forwards.find(n => n.is_confirmed && n.is_send);

    for (const n of [sub, sub2]) {
      n.removeAllListeners()
    }

    // LND 0.13.4 and below do not support preimages in forward notifications
    if (!!sent && !!sent.secret) {
      deepEqual(got, payment, 'Payment subscription notifies of payment');
    }
  } catch (err) {
    deepEqual(err, null, 'Expected no error');
  }

  await kill({});
});
