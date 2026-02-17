import test from 'node:test';
import { equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { componentsOfTransaction } from '@alexbosworth/blockchain';
import { decodePsbt } from 'psbt';
import { spawnLightningCluster } from 'ln-docker-daemons';
import * as tinysecp from 'tiny-secp256k1';
import {
  broadcastChainTransaction,
  createChainAddress,
  fundPsbt,
  getChainBalance,
  getUtxos,
  signPsbt
} from 'lightning';

const count = 100;
const format = 'p2wpkh';
const interval = 10;
const size = 2;
const times = 2000;
const tokens = 1e6;

// Signing a PSBT should result in a finalized PSBT
test(`Sign PSBT`, async () => {
  const ecp = (await import('ecpair')).ECPairFactory(tinysecp);

  const {kill, nodes} = await spawnLightningCluster({size});

  const [control, target] = nodes;

  const {lnd} = target;

  const {address} = await createChainAddress({format, lnd});

  await control.generate({count});

  const [utxo] = (await getUtxos({lnd: control.lnd})).utxos;

  const funded = await asyncRetry({interval, times}, async () => {
    try {
      return await fundPsbt({
        inputs: [{
          transaction_id: utxo.transaction_id,
          transaction_vout: utxo.transaction_vout,
        }],
        lnd: control.lnd,
        outputs: [{address, tokens}],
      });
    } catch (err) {
      // On LND 0.11.1 and below, funding a PSBT is not supported
      if (err.slice().shift() === 501) {
        return;
      }

      throw err;
    }
  });

  // On LND 0.11.1 and below, funding a PSBT is not supported
  if (!funded) {
    await kill({});

    return;
  }

  const finalized = await signPsbt({lnd: control.lnd, psbt: funded.psbt});

  const tx = componentsOfTransaction({transaction: finalized.transaction});

  const decoded = decodePsbt({ecp, psbt: finalized.psbt});

  equal(!!decoded, true, 'Got a finalized PSBT');
  equal(!!tx, true, 'Got a raw signed transaction');

  await asyncRetry({interval, times}, async () => {
    await broadcastChainTransaction({
      lnd: target.lnd,
      transaction: finalized.transaction,
    });
  });

  const startBalance = (await getChainBalance({lnd})).chain_balance;

  await asyncRetry({interval, times}, async () => {
    await target.generate({});

    const chainBalance = (await getChainBalance({lnd})).chain_balance;

    if (chainBalance !== startBalance + tokens) {
      throw new Error('ExpectedTargetReceivedChainTransfer');
    }

    equal(chainBalance, startBalance + tokens, 'Funds received');
  });

  await kill({});
});
