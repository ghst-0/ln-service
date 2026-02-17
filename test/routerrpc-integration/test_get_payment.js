import test from 'node:test';
import { deepEqual, equal, rejects } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  addPeer,
  createInvoice,
  getChannels,
  getHeight,
  getPayment,
  getWalletInfo,
  payViaPaymentRequest
} from 'lightning';

import waitForRoute from './../macros/wait_for_route.js';

const interval = 50;
const size = 3;
const start = new Date().toISOString();
const times = 5000;
const tokens = 100;

// Paying an invoice should settle the invoice
test(`Get payment`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target, remote] = nodes;

  await asyncRetry({interval, times}, async () => {
    const wallet = await getWalletInfo({lnd: remote.lnd});

    await remote.generate({});

    if (!wallet.is_synced_to_chain) {
      throw new Error('NotSyncedToChain');
    }
  });

  const invoice = await createInvoice({tokens, lnd: remote.lnd});

  const {id} = invoice;

  await setupChannel({generate, lnd, to: target});

  await rejects(getPayment({lnd, id}), [404, 'SentPaymentNotFound'], 'None');

  try {
    await payViaPaymentRequest({lnd, request: invoice.request});
  } catch (err) {
    deepEqual(err, [503, 'PaymentPathfindingFailedToFindPossibleRoute']);
  }

  const paymentStatus = await getPayment({id, lnd});

  equal(paymentStatus.is_confirmed, false, 'Unpaid shows as unconfirmed');
  equal(paymentStatus.is_failed, true, 'Failed is present when pay fails');
  equal(paymentStatus.is_pending, false, 'Failure is not pending');

  const [channel] = (await getChannels({lnd})).channels;

  await setupChannel({
    lnd: target.lnd,
    generate: target.generate,
    to: remote,
  });

  const [remoteChan] = (await getChannels({lnd: remote.lnd})).channels;

  await addPeer({lnd, public_key: remote.id, socket: remote.socket});

  await waitForRoute({lnd, tokens, destination: remote.id});

  await payViaPaymentRequest({lnd, request: invoice.request});

  try {
    equal((await getPayment({id, lnd})).is_confirmed, true, 'Paid');
    equal((await getPayment({id, lnd})).is_failed, false, 'Success');
    equal((await getPayment({id, lnd})).is_pending, false, 'Done');

    const {payment} = await getPayment({id, lnd});

    equal(payment.confirmed_at > start, true, 'Got payment conf date');
    equal(payment.created_at > start, true, 'Got payment created at date');
    equal(payment.destination, remote.id);
    equal(payment.fee_mtokens, '1000', 'Fee mtokens tokens paid');
    equal(payment.id, id, 'Payment hash is equal on both sides');
    equal(payment.mtokens, '101000', 'Paid mtokens');
    equal(payment.request, invoice.request, 'Got payment request');
    equal(payment.secret, invoice.secret, 'Paid for invoice secret');

    const height = (await getHeight({lnd})).current_block_height;

    for (const n of payment.hops) {
      equal(n.timeout === height + 40 || n.timeout === height + 43, true);

      delete n.timeout;
    }

    const expectedHops = [
      {
        channel: channel.id,
        channel_capacity: 1000000,
        fee: 1,
        fee_mtokens: '1000',
        forward: invoice.tokens,
        forward_mtokens: invoice.mtokens,
        public_key: target.id,
      },
      {
        channel: remoteChan.id,
        channel_capacity: 1000000,
        fee: 0,
        fee_mtokens: '0',
        forward: 100,
        forward_mtokens: '100000',
        public_key: remote.id,
      },
    ];

    deepEqual(payment.hops, expectedHops, 'Hops are returned');
  } catch (err) {
    equal(err, null, 'No error is returned');
  }

  await kill({});
});
