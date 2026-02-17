import test from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { spawnLightningCluster } from 'ln-docker-daemons';
import {
  addPeer,
  sendMessageToPeer,
  subscribeToPeerMessages
} from 'lightning';

const interval = 10;
const size = 2;
const times = 2000;

// Sending a message to a peer should result in the message received
test(`Send peer message`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, id, lnd}, target] = nodes;

  try {
    await sendMessageToPeer({
      lnd,
      message: Buffer.from('message').toString('hex'),
      public_key: target.id,
    });
  } catch (err) {
    const [code] = err;

    // Send message to peer is not supported on LND 0.13.4 or lower
    if (code === 501) {
      await kill({});

      return;
    }
  }

  try {
    await asyncRetry({interval, times}, async () => {
      await generate({});

      await addPeer({
        lnd,
        public_key: target.id,
        retry_count: 1,
        retry_delay: 1,
        socket: target.socket,
        timeout: 1000,
      });
    });

    const sub = subscribeToPeerMessages({lnd: target.lnd});

    const messages = [];

    sub.on('message_received', message => messages.push(message));

    await asyncRetry({interval, times}, async () => {
      await sendMessageToPeer({
        lnd,
        message: Buffer.from('message').toString('hex'),
        public_key: target.id,
      });

      if (!messages.length) {
        throw new Error('ExpectedMessage');
      }
    });

    const [message] = messages;

    deepStrictEqual(
      message,
      {
        message: Buffer.from('message').toString('hex'),
        public_key: id,
        type: 32768,
      },
      'Message successfully sent to peer'
    );
  } catch (err) {
    strictEqual(err, null, 'Expected no error');
  }

  await kill({});
});
