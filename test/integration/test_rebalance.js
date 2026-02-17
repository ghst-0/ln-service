import test from 'node:test';
import { equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  createInvoice,
  deleteForwardingReputations,
  getChannels,
  getRouteToDestination,
  pay
} from 'lightning';

const give = 1e5;
const interval = 10;
const size = 2;
const times = 2000;
const tokens = 100;

// Rebalancing channels should result in balanced channels
test('Rebalance', async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [control, target] = nodes;

  const {generate, lnd} = control;

  try {
    await setupChannel({generate, lnd, give_tokens: give, to: target});

    await setupChannel({
      generate: target.generate,
      give_tokens: give,
      lnd: target.lnd,
      to: control,
    });

    const invoice = await createInvoice({lnd, tokens});

    await asyncRetry({interval, times}, async () => {
      const [inChanId] = (await getChannels({lnd})).channels.map(({id}) => id);

      await generate({});

      await deleteForwardingReputations({lnd});

      const {route} = await getRouteToDestination({
        lnd,
        tokens,
        destination: control.id,
        outgoing_channel: inChanId,
        payment: invoice.payment,
        total_mtokens: !!invoice.payment ? invoice.mtokens : undefined,
      });

      const selfPay = await pay({
        lnd,
        path: {id: invoice.id, routes: [route]},
      });

      equal(selfPay.secret, invoice.secret, 'Payment made to self');
    });
  } catch (err) {
    equal(err, null, 'Expected no error')
  }

  await kill({});
});
