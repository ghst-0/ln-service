import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { getChannel, getChannels } from 'lightning';

const {ceil} = Math;
const size = 2;

// Getting a channel should return channel details from the channel graph
test(`Get channel`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  await setupChannel({generate, lnd, to: target});

  const [channel] = (await getChannels({lnd})).channels;

  const details = await getChannel({lnd, id: channel.id});

  strictEqual(details.capacity, channel.capacity, 'Capacity');
  strictEqual(details.policies.length, size, 'Policies for both nodes');

  details.policies.forEach(policy => {
    strictEqual(policy.base_fee_mtokens, '1000', 'Base fee mtokens');
    strictEqual([40, 80].includes(policy.cltv_delta), true, 'CLTV policy');
    strictEqual(policy.fee_rate, 1, 'Fee rate');
    strictEqual(policy.is_disabled, false, 'Disabled flag');
    strictEqual(policy.max_htlc_mtokens, `${ceil(details.capacity*0.99)}000`);
    strictEqual(!!policy.min_htlc_mtokens, true, 'Min HTLC value');
    strictEqual(policy.public_key.length, 66, 'Policy public key');
    strictEqual(Date.now()-new Date(policy.updated_at) < 1e5, true, 'Updated');
  });

  strictEqual(details.transaction_id, channel.transaction_id, 'Funding tx id');
  strictEqual(details.transaction_vout, channel.transaction_vout, 'Tx vout');

  strictEqual(Date.now()-new Date(details.updated_at) < 1e5, true, 'Updated');

  try {
    const details = await getChannel({
      lnd,
      transaction_id: channel.transaction_id,
      transaction_vout: channel.transaction_vout,
    });
  } catch (err) {
    const [code] = err;

    // On LND 0.18.0 and below a transaction id and vout is not supported
    if (code !== 404) {
      throw err;
    }
  }

  await kill({});
});
