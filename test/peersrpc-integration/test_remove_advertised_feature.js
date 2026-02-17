import test from 'node:test';
import { deepEqual, equal } from 'node:assert/strict';

import { spawnLightningCluster } from 'ln-docker-daemons';
import { addAdvertisedFeature, getWalletInfo, removeAdvertisedFeature } from 'lightning';

const feature = 12345;

// Removing a feature should result in an updated advertised feature
test(`Add external socket`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{lnd}] = nodes;

  try {
    await addAdvertisedFeature({feature, lnd});

    await removeAdvertisedFeature({feature, lnd});

    const {features} = await getWalletInfo({lnd});

    const added = features.find(n => n.bit === feature);

    equal(added, undefined, 'Feature was removed');

    await kill({});
  } catch (err) {
    await kill({});

    deepEqual(err, [400, 'ExpectedPeersRpcLndBuildTagToAddFeature']);
  }
});
