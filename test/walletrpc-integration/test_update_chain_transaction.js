import test from 'node:test';
import { equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import {
  getChainTransactions,
  updateChainTransaction
} from 'lightning';

const count = 100;
const description = 'description';

// Test updating the description of a chain transaction
test(`Send chain transaction`, async () => {
  const [{generate, kill, lnd}] = (await spawnLightningCluster({})).nodes;

  // Generate some funds
  await generate({count});

  const {transactions} = await getChainTransactions({lnd});

  const [{id}] = transactions;

  await asyncRetry({}, async () => {
    await updateChainTransaction({description, id, lnd});

    const {transactions} = await getChainTransactions({lnd});

    const [tx] = transactions;

    if (tx.description !== description) {
      throw new Error('ExpectedTransactionDescriptionUpdated');
    }

    equal(tx.description, description, 'Got expected transaction');
  });

  await kill({});
});
