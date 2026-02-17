import test from 'node:test';
import { strictEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getBlockHeader, getHeight } from 'lightning';

const headerHexLength = 80 * 2;

// Get block header should return the block header
test(`Get block header`, async () => {
  const {nodes} = await spawnLightningCluster({});

  const [{kill, lnd}] = nodes;

  const blockchain = await getHeight({lnd});

  const height = blockchain.current_block_height;

  // Try getting a block header by the hash
  try {
    const {header} = await getBlockHeader({
      lnd,
      id: blockchain.current_block_hash,
    });

    strictEqual(header.length, headerHexLength, 'Got header');
  } catch (err) {
    const [code, message] = err;

    strictEqual(code, 501, 'Got expected code');
    strictEqual(message, 'GetBlockHeaderMethodNotSupported', 'Got error');

    await kill({});

    return;
  }

  // Try getting a block header by the height
  try {
    const {header} = await getBlockHeader({height, lnd});

    strictEqual(header.length, headerHexLength, 'Got header');
  } catch (err) {
    strictEqual(err, null, 'Expected no error');
  }

  // Try getting the chain tip block header
  try {
    const {header} = await getBlockHeader({lnd});

    strictEqual(header.length, headerHexLength, 'Got header');
  } catch (err) {
    strictEqual(err, null, 'Expected no error');
  }

  await kill({});
});
