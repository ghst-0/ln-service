import test from 'node:test';
import { equal } from 'node:assert/strict';
import { exit } from 'node:process';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { closeChannel,
  getClosedChannels,
  getSweepTransactions,
  getWalletInfo } from 'lightning';

const blockDelay = 50;
const give = 1e5;
const interval = 50;
const size = 2;
const times = 10000;

// Force close a channel and get the resulting sweep transaction
test(`Get sweep transactions`, async t => {
  const {kill, nodes} = await spawnLightningCluster({size});

  t.after(() => exit());

  const [{generate, lnd}, target] = nodes;

  await asyncRetry({interval, times}, async () => {
    const wallet = await getWalletInfo({lnd});

    await generate({});

    if (!wallet.is_synced_to_chain) {
      throw new Error('NotSyncedToChain');
    }
  });

  const channel = await setupChannel({
    generate,
    lnd,
    give_tokens: give,
    partner_csv_delay: blockDelay,
    to: target,
  });

  await closeChannel({
    lnd,
    is_force_close: true,
    transaction_id: channel.transaction_id,
    transaction_vout: channel.transaction_vout,
  });

  await asyncRetry({interval, times}, async () => {
    await generate({});

    if ((await getClosedChannels({lnd})).channels.length > 0) {
      return;
    }

    throw new Error('ExpectedClosedChannel');
  });

  const transactions = await asyncRetry({interval, times}, async () => {
    const {transactions} = await getSweepTransactions({lnd});

    const [transaction] = transactions;

    if (!transaction || !transaction.block_id) {
      throw new Error('ExpectedTransactionBlockId');
    }

    return transactions;
  });

  const [transaction] = transactions;

  const [anchorTokens, sweepTokens] = transactions
    .map(n => n.tokens).toSorted();

  equal(transactions.length, 2, 'Got closed channel sweep');

  // LND 0.15.0 and before have different sweep tokens
  if (sweepTokens === 890455) {
    equal(anchorTokens, 149, 'Sweep has tokens amount');
    equal(sweepTokens, 890455, 'Sweep has tokens amount');
  } else if (anchorTokens === 147) {
    equal(anchorTokens, 147, 'Sweep has tokens amount');
    equal(sweepTokens, 889855, 'Sweep has tokens amount');
  } else {
    equal(anchorTokens, 136, 'Sweep has tokens amount');
    equal(sweepTokens, 889855, 'Sweep has tokens amount');
  }

  equal(transaction.block_id.length, 64, 'Sweep confirmed');
  equal(!!transaction.confirmation_count, true, 'Sweep confirm count');
  equal(!!transaction.confirmation_height, true, 'Sweep confirm height');
  equal(!!transaction.created_at, true, 'Sweep creation date');
  equal(transaction.fee, undefined, 'Sweep fee is undefined');
  equal(transaction.id.length, 64, 'Sweep has transaction id');
  equal(transaction.is_confirmed, true, 'Sweep is confirmed');
  equal(transaction.output_addresses.length, 1, 'Sweep has out address');
  equal(transaction.transaction.length > 0, true, 'Sweep has transaction');

  if (transaction.description) {
    equal(transaction.description, '0:sweep', 'Sweep has description');
  } else {
    equal(transaction.description, undefined, 'Sweep has description');
  }

  await kill({});
});
