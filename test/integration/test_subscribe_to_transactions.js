import test from 'node:test';
import { equal, fail } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import {
  createChainAddress,
  getChainBalance,
  getHeight,
  sendToChainAddress,
  subscribeToTransactions
} from 'lightning';

const confirmationCount = 6;
const interval = 100;
const size = 2;
const times = 200;
const tokens = 1e6;

// Subscribing to chain transactions should result in tx events
test(`Subscribe to chain transactions`, async () => {
  const transactions = [];

  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  await asyncRetry({times}, async () => {
    if ((await getChainBalance({lnd})).chain_balance) {
      return;
    }

    await generate({});

    throw new Error('ExpectedChainBalance');
  });

  const startHeight = (await getHeight({lnd})).current_block_height
  const sub = subscribeToTransactions({lnd});

  sub.on('error', () => {});
  sub.on('chain_transaction', tx => transactions.push(tx));

  await sendToChainAddress({
    lnd,
    tokens,
    address: (await createChainAddress({lnd: target.lnd})).address,
  });

  // Generate to confirm the tx
  await generate({count: confirmationCount});

  const tx = await asyncRetry({interval, times}, async () => {
    const [tx] = transactions
      .filter(n => n.is_confirmed)
      .filter(n => n.output_addresses.length === 2);

    if (!tx) {
      throw new Error('ExpectedConfirmedTransaction');
    }

    return tx;
  });

  equal(!!tx.created_at, true, 'Tx has a creation date');
  equal(tx.is_outgoing, true, 'Tx is outgoing');
  equal(!!tx.id, true, 'Tx has an id');

  // LND 0.15.4 and below do not use P2TR change addresses
  if (tx.fee === 7050) {
    equal(tx.fee, 7050, 'Transaction has a chain fee');
    equal(tx.tokens, 1007050, 'Tx tokens is fee + tokens sent');
  } else if (tx.fee === 7650) { // LND 0.18.5 and below fee rate
    equal(tx.fee, 7650, 'Transaction has a chain fee');
    equal(tx.tokens, 1007650, 'Tx tokens is fee + tokens sent');
  } else {
    equal(tx.fee, 3825, 'Transaction has a chain fee');
    equal(tx.tokens, 1003825, 'Tx tokens is fee + tokens sent');
  }

  if (tx.output_addresses.some(n => n.length < 14 || n.length > 74)) {
    fail('Output address lengths must be between 14 and 74');
  }

  equal(!!tx.block_id, true, 'Tx is confirmed in a block');
  equal(tx.confirmation_count, [tx].length, 'Tx has a confirmation');
  equal(tx.confirmation_height >= startHeight, true, 'Got block height');

  await kill({});
});
