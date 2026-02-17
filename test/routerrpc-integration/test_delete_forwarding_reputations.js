import test from 'node:test';
import { equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import {
  addPeer,
  createInvoice,
  deleteForwardingReputations,
  getForwardingReputations,
  getNetworkGraph,
  payViaPaymentRequest,
  probeForRoute
} from 'lightning';

import waitForRoute from './../macros/wait_for_route.js';

const flatten = arr => [].concat(...arr);
const interval = 10;
const size = 3;
const times = 1000;
const tlvOnionBit = 14;
const tokens = 1e6 / 2;

// Deleting forwarding reputations should eliminate forwarding reputations
test('Delete forwarding reputations', async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target, remote] = nodes;

  try {
    const controlToTargetChan = await setupChannel({
      generate,
      lnd,
      to: target,
    });

    const targetToRemoteChan = await setupChannel({
      generate: target.generate,
      lnd: target.lnd,
      to: remote,
    });

    await addPeer({lnd, public_key: remote.id, socket: remote.socket});

    const {request} = await createInvoice({tokens, lnd: remote.lnd});

    await asyncRetry({interval, times}, async () => {
      const {channels, nodes} = await getNetworkGraph({lnd});

      const limitedFeatures = nodes.find(node => {
        return !node.features.find(n => n.bit === tlvOnionBit);
      });

      const policies = flatten(channels.map(n => n.policies));

      const cltvDeltas = policies.map(n => n.cltv_delta);

      if (!!cltvDeltas.filter(n => !n).length) {
        throw new Error('ExpectedAllChannelPolicies');
      }

      if (!!limitedFeatures) {
        throw new Error('NetworkGraphSyncIncomplete');
      }
    });

    await waitForRoute({lnd, tokens, destination: remote.id});

    try {
      await payViaPaymentRequest({lnd, request});
    } catch (err) {
      equal(err, null, 'Expected no error paying payment request');
    }

    try {
      await probeForRoute({lnd, tokens, destination: remote.id});
    } catch (err) {}

    {
      const {nodes} = await getForwardingReputations({lnd});

      equal(nodes.length, 2, 'Reputations should exist');
    }

    await deleteForwardingReputations({lnd});

    {
      const {nodes} = await getForwardingReputations({lnd});

      equal(nodes.length, [].length, 'Reputations should be wiped');
    }

    await kill({});
  } catch (err) {
    await kill({});

    equal(err, null, 'Expected no error');
  }
});
