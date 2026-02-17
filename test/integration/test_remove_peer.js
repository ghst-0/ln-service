import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import { addPeer, getPeers, removePeer } from 'lightning';

const interval = 10;
const size = 2;
const times = 2000;

// Removing peers should result in a removed peer
test(`Remove a peer`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  try {
    await asyncRetry({interval, times}, async () => {
      await generate({});

      await addPeer({lnd, public_key: target.id, socket: target.socket});
    });

    const {peers} = await getPeers({lnd});

    const [targetPeer] = peers;

    strictEqual(targetPeer.public_key, target.id, 'Peer is added');

    await removePeer({lnd, public_key: targetPeer.public_key});

    await asyncRetry({interval, times}, async () => {
      const postRemovalPeers = await getPeers({lnd});

      if (!!postRemovalPeers.peers.length) {
        throw new Error('ExpectedPeerRemoved');
      }

      strictEqual(postRemovalPeers.peers.length, [].length, 'Peer is removed');
    });
  } catch (err) {
    strictEqual(err, null, 'Expected no error');
  }

  await kill({});
});
