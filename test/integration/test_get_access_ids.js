import test from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { getAccessIds, grantAccess } from 'lightning';

const defaultId = '0';
const id = '1';

// Getting access ids should return root macaroon ids
test(`Get access ids`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  await grantAccess({id, lnd, is_ok_to_create_chain_addresses: true});

  const {ids} = await getAccessIds({lnd});

  deepStrictEqual(ids, [defaultId, id], 'Got expected access ids');

  await kill({});
});
