import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { setupChannel, spawnLightningCluster } from 'ln-docker-daemons';
import { addPeer, getNetworkCentrality } from 'lightning';

const interval = 100;
const size = 3;
const times = 800;

// Getting the network centrality should return the centrality scores
test(`Get network centrality`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [control, target, remote] = nodes;

  const {lnd} = control;

  try {
    await control.generate({count: 100});

    await asyncRetry({interval, times}, async () => {
      await addPeer({lnd, public_key: remote.id, socket: remote.socket});

      await setupChannel({lnd, generate: control.generate, to: target});

      await setupChannel({
        generate: target.generate,
        lnd: target.lnd,
        to: remote,
      });
    });

    await asyncRetry({interval, times}, async () => {
      await addPeer({lnd, public_key: remote.id, socket: remote.socket});

      const {nodes} = await getNetworkCentrality({lnd});

      const controlScore = nodes.find(n => n.public_key === control.id);
      const remoteScore = nodes.find(n => n.public_key === remote.id);
      const targetScore = nodes.find(n => n.public_key === target.id);

      if (!targetScore.betweenness || !targetScore.betweenness_normalized) {
        throw new Error('UnexpectedValueForTargetScoreBetweenness');
      }

      if (targetScore.betweenness !== 1e6) {
        throw new Error('WrongBetweennessScore');
      }

      strictEqual(controlScore.betweenness, 0, 'No centrality on control');
      strictEqual(controlScore.betweenness_normalized, 0, 'No centrality');
      strictEqual(remoteScore.betweenness, 0, 'No centrality on remote');
      strictEqual(remoteScore.betweenness_normalized, 0, 'No centrality');
      strictEqual(targetScore.betweenness, 1e6, 'Centrality around target');
      strictEqual(targetScore.betweenness_normalized, 1e6, 'Centrality');

      return;
    });
  } catch (err) {
    strictEqual(err, null, 'Expected no error');
  }

  await kill({});

  return;
});
