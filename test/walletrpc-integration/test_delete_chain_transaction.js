import test from 'node:test';
import { deepEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import {
  broadcastChainTransaction,
  createChainAddress,
  deleteChainTransaction,
  fundPsbt,
  getChainTransactions,
  getWalletInfo,
  signPsbt
} from 'lightning';

const count = 100;
const interval = 100;
const times = 300;
const tokens = 1e6;

// Deleting a chain transaction should delete the chain transactions
test(`Delete chain transaction`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  // Generate some funds for LND
  await generate({count});

  await asyncRetry({interval: 10, times: 6000}, async () => {
    const wallet = await getWalletInfo({lnd});

    if (!wallet.is_synced_to_chain) {
      throw new Error('ExpectedWalletSyncedToChain');
    }

    await generate({});

    if (wallet.current_block_height < count + 1) {
      throw new Error('ExpectedFullySyncedToChain');
    }
  });

  // Wait for generation to be over
  const tx = await asyncRetry({times}, async () => {
    const {transactions} = await getChainTransactions({lnd});

    const [tx] = transactions;

    if (!tx.is_confirmed) {
      throw new Error('ExpectedTransactionConfirmed');
    }

    return tx;
  });

  const {address} = await createChainAddress({lnd});

  const funded = await asyncRetry({interval, times}, async () => {
    await generate({});

    return await fundPsbt({lnd, outputs: [{address, tokens}]});
  });

  const {transaction} = await signPsbt({lnd, psbt: funded.psbt});

  const {id} = await broadcastChainTransaction({lnd, transaction});

  try {
    await deleteChainTransaction({id, lnd});

    await kill({});
  } catch (err) {
    await kill({});

    deepEqual(err, [501, 'RemoveChainTransactionMethodNotSupported'], 'None');
  }
});
