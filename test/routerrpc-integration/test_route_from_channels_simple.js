import test from 'node:test';
import { equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { routeFromChannels} from 'bolt07';
import {
  addPeer,
  createInvoice,
  decodePaymentRequest,
  getHeight,
  getChannel,
  getRouteThroughHops,
  getRouteToDestination,
  getWalletInfo,
  payViaRoutes,
  updateRoutingFees
} from 'lightning';

import waitForRoute from './../macros/wait_for_route.js';

const baseFee = '1000';
const confirmationCount = 6;
const discount = '1000';
const interval = 10;
const size = 3;
const times = 1000;
const tokens = 100;

// Calculating a route from channels should result in a route
test(`Get route through hops`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target, remote] = nodes;

  const controlToTargetChan = await setupChannel({generate, lnd, to: target});

  await generate({});

  const targetRemoteChannel = await asyncRetry({interval, times}, async () => {
    await generate({});

    await addPeer({
      lnd: target.lnd,
      public_key: remote.id,
      socket: remote.socket,
    });

    await setupChannel({
      generate: target.generate,
      lnd: target.lnd,
      to: remote,
    });
  });

  await target.generate({count: confirmationCount});

  await asyncRetry({interval, times}, async () => {
    const wallet = await getWalletInfo({lnd: remote.lnd});

    await addPeer({lnd, public_key: remote.id, socket: remote.socket});

    if (!wallet.is_synced_to_chain) {
      throw new Error('ExpectedWalletSyncedToChain');
    }
  });

  const invoice = await createInvoice({
    tokens,
    cltv_delta: 60,
    lnd: remote.lnd,
  });

  const {request} = invoice;

  const decodedRequest = await decodePaymentRequest({lnd, request});

  await waitForRoute({lnd, destination: remote.id, tokens: invoice.tokens});

  await asyncRetry({interval, times}, async () => {
    return await getRouteToDestination({
      lnd,
      cltv_delta: decodedRequest.cltv_delta,
      destination: decodedRequest.destination,
      tokens: invoice.tokens,
    });
  });

  const policyAStart = await getChannel({lnd, id: controlToTargetChan.id});

  // Target gives a discount to traffic coming from control
  await updateRoutingFees({
    inbound_base_discount_mtokens: discount,
    lnd: target.lnd,
    transaction_id: controlToTargetChan.transaction_id,
    transaction_vout: controlToTargetChan.transaction_vout,
  });

  // Wait for policy to be updated
  const policyA = await asyncRetry({interval, times}, async () => {
    const policy = await getChannel({lnd, id: controlToTargetChan.id});

    if (policy.updated_at === policyAStart.updated_at) {
      throw new Error('PolicyNotUpdatedYet');
    }

    return policy;
  });

  // A discount should be set for traffic from control to remote
  const discountFee = policyA.policies.find(n => n.public_key === target.id);

  // Get the routing policy of target to remote to calculate the route
  const policyB = await getChannel({
    id: targetRemoteChannel.id,
    lnd: target.lnd,
  });

  const channelsRoute = routeFromChannels({
    channels: [policyA, policyB],
    cltv_delta: decodedRequest.cltv_delta + confirmationCount,
    destination: decodedRequest.destination,
    height: (await getHeight({lnd})).current_block_height,
    mtokens: decodedRequest.mtokens,
    payment: decodedRequest.payment,
    total_mtokens: decodedRequest.mtokens,
  });

  await asyncRetry({interval, times}, async () => {
    return await getRouteThroughHops({
      lnd,
      cltv_delta: decodedRequest.cltv_delta + confirmationCount,
      mtokens: decodedRequest.mtokens,
      payment: decodedRequest.payment,
      public_keys: [target.id, remote.id],
      total_mtokens: decodedRequest.mtokens,
    });
  });

  const discounted = BigInt(discountFee.inbound_base_discount_mtokens);

  const gotTotalFee = BigInt(channelsRoute.route.fee_mtokens);

  await payViaRoutes({lnd, id: invoice.id, routes: [channelsRoute.route]});

  await kill({});

  equal(gotTotalFee, BigInt(baseFee) - discounted, 'Got expected discount');
});
