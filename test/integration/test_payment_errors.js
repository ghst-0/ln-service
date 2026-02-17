import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { hopsFromChannels, routeFromHops } from 'bolt07';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';

import {
  createInvoice,
  getChannel, getChannels,
  getHeight,
  pay
} from 'lightning';

const interval = 10;
const mtok = '000';
const size = 2;
const times = 1000;
const tokens = 1e3;

// Encountering errors in payment should return valid error codes
test('Payment errors', async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [control, target] = nodes;

  const {lnd} = control;

  // Create a channel from the control to the target node
  const controlToTargetChannel = await setupChannel({
    lnd,
    generate: control.generate,
    to: target,
  });

  // Create a channel from the target back to the control
  const targetToControlChannel = await setupChannel({
    generate: target.generate,
    lnd: target.lnd,
    to: control,
  });

  const height = (await getHeight({lnd})).current_block_height;
  const invoice = await createInvoice({lnd, tokens});
  const mtokens = `${tokens}${mtok}`;

  const {channels} = await getChannels({lnd});
  const {id} = invoice;

  const [inChanId, outChanId] = channels.map(({id}) => id).sort();

  const destination = control.id;

  try {
    let route;

    // Wait for graph sync and pay
    await asyncRetry({interval, times}, async () => {
      const inChan = await getChannel({lnd, id: inChanId});
      const outChan = await getChannel({lnd, id: outChanId});

      inChan.id = inChanId;
      outChan.id = outChanId;

      const {hops} = hopsFromChannels({
        destination,
        channels: [inChan, outChan],
      });

      route = routeFromHops({
        height,
        hops,
        mtokens,
        initial_cltv: 40,
      });
    });

    route.hops[0].fee = 0;
    route.hops[0].fee_mtokens = '0';
    route.fee = 0;
    route.fee_mtokens = '0';
    route.mtokens = '1000000';
    route.tokens = 1000;

    await pay({lnd, path: {id, routes: [route]}});

    await kill({});
  } catch (err) {
    await kill({});

    if (Array.isArray(err)) {
      const [, code, context] = err;

      strictEqual(code, 'FeeInsufficient', 'Pay fails due to low fee');
    } else {
      strictEqual(err, null, 'Expected array type error');
    }
  }
});
