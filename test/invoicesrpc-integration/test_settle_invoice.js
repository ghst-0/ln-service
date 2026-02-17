import test from 'node:test';
import { deepEqual, equal, rejects } from 'node:assert/strict';

import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  createHodlInvoice,
  createInvoice,
  getChannelBalance,
  getChannels,
  getInvoice,
  getInvoices,
  getWalletInfo,
  pay,
  settleHodlInvoice
} from 'lightning';

const anchorFeatureBit = 23;
const cltvDelta = 144;
const size = 3;
const sweepBlockCount = 40;
const tokens = 100;

// Create a hodl invoice
test(`Pay a hodl invoice`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [control, target, remote] = nodes;

  const {features} = await getWalletInfo({lnd: control.lnd});

  const isAnchors = !!features.find(n => n.bit === anchorFeatureBit);

  await setupChannel({
    generate: control.generate,
    lnd: control.lnd,
    to: target,
  });

  await setupChannel({
    lnd: target.lnd,
    generate: target.generate,
    to: remote,
  });

  const {id, request, secret} = await createInvoice({lnd: remote.lnd});

  const invoice = await createHodlInvoice({
    id,
    tokens,
    cltv_delta: cltvDelta,
    lnd: target.lnd,
  });

  await rejects(
    settleHodlInvoice({secret, lnd: target.lnd}),
    [402, 'CannotSettleHtlcBeforeHtlcReceived'],
    'An HTLC cannot be settled before the accept stage'
  );

  await rejects(
    settleHodlInvoice({lnd: target.lnd, secret: id}),
    [404, 'SecretDoesNotMatchAnyExistingHodlInvoice'],
    'An HTLC cannot be settled if it does not exist'
  );

  setTimeout(async () => {
    const {lnd} = target;

    const [channel] = (await getChannels({lnd})).channels
      .filter(n => n.pending_payments.length);

    const [created] = (await getInvoices({lnd})).invoices;
    const wallet = await getWalletInfo({lnd});

    const invoice = await getInvoice({id, lnd});
    const [pending] = channel.pending_payments;

    const gotCltvDelay = pending.timeout - wallet.current_block_height;
    const timeout = pending.timeout - sweepBlockCount;

    const delay = gotCltvDelay === cltvDelta || gotCltvDelay === cltvDelta+3;

    equal(delay, true, 'invoice cltv delay as expected');
    equal(created.is_confirmed, false, 'invoices shows not yet been settled');
    equal(created.is_held, true, 'invoices shows HTLC locked in place');
    equal(invoice.is_confirmed, false, 'HTLC has not yet been settled');
    equal(invoice.is_held, true, 'HTLC is locked in place');

    const [held] = (await getInvoices({lnd})).invoices;

    const controlChannelBalance = await getChannelBalance({lnd});

    // LND 0.11.1 and below do not support extended channel balance details
    if (!isAnchors) {
      if (!!controlChannelBalance.channel_balance_mtokens) {
        deepEqual(controlChannelBalance, {
          channel_balance: 990950,
          channel_balance_mtokens: '990950000',
          inbound: 990850,
          inbound_mtokens: '990850000',
          pending_balance: 0,
          pending_inbound: 0,
          unsettled_balance: tokens,
          unsettled_balance_mtokens: '100000',
        },
        'Channel balance is updated');
      }
    }

    deepEqual(invoice, held, 'Invoice is held');

    const {secret} = await pay({lnd, request, timeout, tokens});

    await settleHodlInvoice({secret, lnd: target.lnd});

    const [settled] = (await getInvoices({lnd})).invoices;

    equal(settled.is_confirmed, true, 'HTLC is settled back');

    return setTimeout(async () => {
      await kill({});
    },
    1000);
  },
  1000);

  const paid = await pay({lnd: control.lnd, request: invoice.request});

  equal(paid.secret, secret, 'Paying reveals the HTLC secret');
});
