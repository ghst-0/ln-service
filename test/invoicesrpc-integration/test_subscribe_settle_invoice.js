import test from 'node:test';
import { equal } from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  createHodlInvoice,
  payViaPaymentRequest,
  settleHodlInvoice,
  subscribeToInvoice
} from 'lightning';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const interval = 10;
const size = 2;
const times = 1500;
const tlvType = '67890';
const tlvValue = '00';
const tokens = 100;

// Subscribe to a settled invoice should return invoice settled event
test(`Subscribe to settled invoice`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  let currentInvoice;

  await setupChannel({generate, lnd, to: target});

  const secret = randomBytes(32);

  const sub = subscribeToInvoice({
    id: createHash('sha256').update(secret).digest('hex'),
    lnd: target.lnd,
  });

  sub.on('invoice_updated', data => currentInvoice = data);

  const invoice = await createHodlInvoice({
    tokens,
    id: createHash('sha256').update(secret).digest('hex'),
    lnd: target.lnd,
  });

  await delay(1000);

  equal(!!currentInvoice.is_held, false, 'Invoice is not held yet');
  equal(!!currentInvoice.is_canceled, false, 'Invoice is not canceled');
  equal(!!currentInvoice.is_confirmed, false, 'Invoice is not confirmed yet');

  setTimeout(async () => {
    // Wait for the invoice to be held
    await asyncRetry({interval, times}, async () => {
      if (!currentInvoice.is_held) {
        throw new Error('ExpectedInvoiceHeld');
      }
    });

    equal(!!currentInvoice.is_held, true, 'Invoice is not held yet');
    equal(!!currentInvoice.is_canceled, false, 'Invoice is not canceled yet');
    equal(!!currentInvoice.is_confirmed, false, 'Invoice is confirmed');

    await settleHodlInvoice({
      lnd: target.lnd,
      secret: secret.toString('hex'),
    });

    // Wait for the invoice to be confirmed
    await asyncRetry({interval, times}, async () => {
      if (!currentInvoice.is_confirmed) {
        throw new Error('ExpectedInvoiceConfirmed');
      }
    });

    const {payments} = currentInvoice;

    if (!!payments.length) {
      const [payment] = payments;

      const messages = payment.messages.filter(n => n.type === tlvType);

      if (!!messages.filter(n => n.type === tlvType).length) {
        const [{type, value}] = messages;

        equal(type, tlvType, 'Payment message TLV type returned');
        equal(value, tlvValue, 'Payment message TLV value returned');
      }
    }

    equal(!!currentInvoice.is_held, false, 'Invoice is not held yet');
    equal(!!currentInvoice.is_canceled, false, 'Invoice is not canceled yet');
    equal(!!currentInvoice.is_confirmed, true, 'Invoice is confirmed');

    currentInvoice = 'finished';

    await kill({});
  },
  1000);

  const paid = await payViaPaymentRequest({
    lnd,
    messages: [{type: tlvType, value: tlvValue}],
    request: invoice.request,
  });

  equal(paid.secret, secret.toString('hex'), 'Paying reveals the HTLC secret');

  await asyncRetry({interval, times}, async () => {
    if (currentInvoice !== 'finished') {
      throw new Error('WaitingForSettlement');
    }
  });
});
