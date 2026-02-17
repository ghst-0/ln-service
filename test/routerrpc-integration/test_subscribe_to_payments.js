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
  subscribeToPayments
} from 'lightning';

const interval = 1000;
const size = 2;
const times = 1000;
const tokens = 100;
const unsupported = 'unknown method TrackPayments for service routerrpc.Router';

// Subscribing to payments should notify on a payment
test(`Subscribe to payments`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  try {
    const forwards = [];
    const isLegacy = [];
    const isPaying = [];
    const payments = [];

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

    const sub = subscribeToPayments({lnd});
    const sub2 = subscribeToForwards({lnd});

    sub2.on('forward', forward => forwards.push(forward));
    sub.on('confirmed', payment => payments.push(payment));
    sub.on('paying', payment => isPaying.push(payment));

    sub.on('error', error => {
      const [,, {err}] = error;

      // subscribeToPayments is not supported on LND 0.15.5 and below
      if (err.details === unsupported) {
        return isLegacy.push(error);
      }

      return deepEqual(error, null, 'Expected no error');
    });

    await payViaPaymentRequest({lnd, request: invoice.request});

    const {payment} = await getPayment({id, lnd});

    await asyncRetry({interval: 10, times: 1000}, async () => {
      if (forwards.length !== 2) {
        throw new Error('ExpectedForwardsEvents');
      }
    });

    // Exit early when this is a legacy LND
    if (isLegacy.length > 0) {
      for (const n of [sub, sub2]) {
        n.removeAllListeners()
      }

      await kill({});

      return;
    }

    const [got] = payments;

    for (const n of [sub, sub2]) {
      n.removeAllListeners()
    }

    deepEqual(got, payment, 'Payment subscription notifies of payment');

    const [pending] = isPaying;

    deepEqual(pending.created_at, payment.created_at, 'Got date');
    deepEqual(pending.destination, payment.destination, 'Got destination');
    deepEqual(pending.id, payment.id, 'Got id');
    deepEqual(pending.mtokens, payment.mtokens, 'Got mtokens');
    deepEqual(pending.paths.length, payment.paths.length, 'Got path');
    deepEqual(pending.request, payment.request, 'Got request');
    deepEqual(pending.safe_tokens, payment.safe_tokens, 'Got safe tokens');
    deepEqual(pending.timeout, payment.timeout, 'Got timeout');
    deepEqual(pending.tokens, payment.tokens, 'Got tokens');
  } catch (err) {
    deepEqual(err, null, 'Expected no error');
  }

  await kill({});
});
