import test from 'node:test';
import { equal } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import {
  broadcastChainTransaction,
  createChainAddress,
  fundPsbt,
  getUtxos,
  requestChainFeeIncrease,
  signPsbt
} from 'lightning';

const count = 100;
const tokens = 1e8;

// Test requesting a chain fee increase
test(`Request chain fee increase`, async () => {
  const [{generate, kill, lnd}] = (await spawnLightningCluster({})).nodes;

  try {
    await generate({count});

    const {address} = await createChainAddress({lnd});

    const {psbt} = await fundPsbt({lnd, outputs: [
      {address, tokens},
      {tokens, address: '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF'},
    ]});

    const {transaction} = await signPsbt({lnd, psbt});

    await broadcastChainTransaction({lnd, transaction});

    const bump = (await getUtxos({lnd})).utxos.find(n => n.tokens === tokens);

    // // LND 0.19.0 does not support this error
    // try {
    //   await requestChainFeeIncrease({
    //     lnd,
    //     transaction_id: bump.transaction_id,
    //     transaction_vout: bump.transaction_vout + 1,
    //   });
    //
    //   fail('Expected chain fee increase rejected');
    // } catch (err) {
    //   deepEqual(err, [404, 'SpecifiedOutpointNotFoundInWalletUtxos'], '404');
    // }

    await requestChainFeeIncrease({
      lnd,
      transaction_id: bump.transaction_id,
      transaction_vout: bump.transaction_vout,
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }
});
