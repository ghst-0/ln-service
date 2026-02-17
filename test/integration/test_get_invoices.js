import test from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import asyncEach from 'async/each.js';
import asyncRetry from 'async/retry.js';
import { getWalletInfo, cancelHodlInvoice, createInvoice, getInvoices } from 'lightning';

const interval = 1000;
const limit = 1;
const times = 1000;

// Get invoices should result in a list of created invoices
test(`Get invoices`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  try {
    const [{generate, lnd}] = nodes;

    // Make sure that target is synced to the chain otherwise invoice can halt
    await asyncRetry({interval, times}, async () => {
      const wallet = await getWalletInfo({lnd});

      await generate({});

      if (!wallet.is_synced_to_chain) {
        throw new Error('WaitingForSyncToChain');
      }
    });

    const invoices = [
      await createInvoice({lnd, description: '3'}),
      await createInvoice({lnd, description: '2'}),
      await createInvoice({lnd, description: '1'}),
    ];

    invoices.reverse();

    const firstPage = await getInvoices({limit, lnd});

    strictEqual(!!firstPage.next, true, 'First page has a next token');

    const secondPage = await getInvoices({lnd, token: firstPage.next});

    strictEqual(!!secondPage.next, true, 'Second page has a next token');

    const thirdPage = await getInvoices({lnd, token: secondPage.next});

    strictEqual(!!thirdPage.next, false, 'Third page has no next token');

    const receivedInvoices = []
      .concat(firstPage.invoices)
      .concat(secondPage.invoices)
      .concat(thirdPage.invoices);

    receivedInvoices.forEach((invoice, i) => {
      const expected = invoices[i];

      strictEqual(invoice.chain_address, expected.chain_address, 'Address');
      strictEqual(invoice.confirmed_at, expected.confirmed_at, 'Confirmed at');
      strictEqual(invoice.id, expected.id, 'Invoice id');
      strictEqual(invoice.request, expected.request, 'Payment request');
      strictEqual(invoice.secret, expected.secret, 'Payment secret');
      strictEqual(invoice.tokens, expected.tokens, 'Tokens');
    });

    const reversed = invoices.slice().reverse();

    await asyncEach(reversed.filter((n, i) => !!i), async invoice => {
      return await cancelHodlInvoice({lnd, id: invoice.id});
    });

    const unconfirmed = await getInvoices({limit, lnd, is_unconfirmed: true});

    deepStrictEqual(unconfirmed, thirdPage, 'Pending invoices are ignored');
  } catch (err) {
    strictEqual(err, null, 'No error is expected');
  }

  await kill({});

  return;
});
