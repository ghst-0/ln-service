import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import {
  createChainAddress,
  getChainBalance,
  getChainTransactions,
  sendToChainAddress
} from 'lightning';

const description = 'description';
const format = 'p2wpkh';
const interval = 50;
const size = 2;
const times = 2000;
const tokens = 1e6;
const txIdHexByteLength = 64;

// Sending to chain addresses should result in on-chain sent funds
test(`Send to chain address`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  try {
    const [control, target] = nodes;

    const {lnd} = target;

    const {address} = await createChainAddress({format, lnd});

    await control.generate({count: 100});

    const startBalance = await getChainBalance({lnd});

    // Send funds from control to target
    const sent = await sendToChainAddress({
      address,
      description,
      tokens,
      lnd: control.lnd,
    });

    strictEqual(sent.id.length, txIdHexByteLength, 'Transaction id');
    strictEqual(sent.is_confirmed, false, 'Transaction is not yet confirmed');
    strictEqual(sent.is_outgoing, true, 'Transaction is outgoing');
    strictEqual(sent.tokens, tokens, 'Tokens amount matches tokens sent');

    // Wait for generation to be over
    await asyncRetry({interval, times}, async () => {
      // Generate to confirm the tx
      await control.generate({});

      const endBalance = await getChainBalance({lnd});

      const adjustment = endBalance.chain_balance - startBalance.chain_balance;

      if (adjustment !== tokens) {
        throw new Error('BalanceNotYetShifted');
      }
    });

    const endBalance = await getChainBalance({lnd});

    const adjustment = endBalance.chain_balance - startBalance.chain_balance;

    strictEqual(adjustment, tokens, 'Transaction balance is shifted');

    try {
      await asyncRetry({interval, times}, async () => {
        await sendToChainAddress({
          address,
          is_send_all: true,
          lnd: control.lnd,
        });

        if ((await getChainBalance({lnd: control.lnd})).chain_balance) {
          throw new Error('ExpectedChainBalanceOnControlEmptiedOut');
        }
      });

      const controlFunds = await getChainBalance({lnd: control.lnd});

      strictEqual(controlFunds.chain_balance, 0, 'All funds sent on-chain');
    } catch (err) {
      if (err[2].message !== '2 UNKNOWN: transaction output is dust') {
        throw err;
      }
    }

    const {transactions} = await getChainTransactions({lnd: control.lnd});

    const sentTransaction = transactions.find(n => n.id === sent.id);

    strictEqual(sentTransaction.description, description, 'Got label');
  } catch (err) {
    strictEqual(err, null, 'ExpectedNoErrorSendingToChainAddress');
  }

  await kill({});
});
