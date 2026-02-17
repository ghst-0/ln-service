import test from 'node:test';
import { equal } from 'node:assert/strict';

import asyncRetry from 'async/retry.js';
import { address, networks, Transaction } from 'bitcoinjs-lib';
import { controlBlock, hashForTree, leafHash, signHash, v1OutputScript } from 'p2tr';
import { createPsbt, decodePsbt } from 'psbt';
import { pointAdd, privateAdd, signSchnorr } from 'tiny-secp256k1';
import { scriptElementsAsScript } from '@alexbosworth/blockchain';
import { spawnLightningCluster } from 'ln-docker-daemons';
import * as tinysecp from 'tiny-secp256k1';
import {
  broadcastChainTransaction,
  createChainAddress,
  fundPsbt,
  getUtxos,
  signPsbt
} from 'lightning';

const compile = elements => scriptElementsAsScript({elements}).script;
const count = 100;
const defaultInternalKey = '0350929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';
const {from} = Buffer;
const {fromBech32} = address;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = retryCount => 10 * Math.pow(2, retryCount);
const OP_CHECKSIG = 172;
const smallTokens = 2e5;
const times = 20;
const {toOutputScript} = address;
const tokens = 1e6;

// Funding a transaction should result in a funded PSBT
test(`Fund PSBT`, async () => {
  const ecp = (await import('ecpair')).ECPairFactory(tinysecp);
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  await generate({count});

  const {address} = await createChainAddress({lnd});
  const [utxo] = (await getUtxos({lnd})).utxos;

  const funded = await asyncRetry({interval, times}, async () => {
    try {
      return await fundPsbt({
        lnd,
        inputs: [{
          transaction_id: utxo.transaction_id,
          transaction_vout: utxo.transaction_vout,
        }],
        outputs: [{address, tokens}],
      });
    } catch (err) {
      // On LND 0.11.1 and below, funding a PSBT is not supported
      if (err.slice().shift() === 501) {
        return;
      }

      throw err;
    }
  });

  const [input] = funded.inputs;

  equal(funded.inputs.length, [utxo].length, 'Got expected number of inputs');
  equal(input.transaction_id, utxo.transaction_id, 'Got expected input tx id');
  equal(input.transaction_vout, utxo.transaction_vout, 'Got expected tx vout');
  equal(input.lock_expires_at > new Date().toISOString(), true, 'Got expires');
  equal(input.lock_id.length, 64, 'Got lock identifier');

  equal(funded.outputs.length, 2, 'Got expected output count');

  const change = funded.outputs.find(n => n.is_change);
  const output = funded.outputs.find(n => !n.is_change);

  // LND 0.15.4 and below use P2WPKH as change
  if (change.output_script.length === 44) {
    equal(change.output_script.length, 44, 'Change address is returned');
    equal(change.tokens, 4998992950, 'Got change output value');
  } else if (change.tokens === 4998992350) { // LND 0.18.5 and below
    equal(change.output_script.length, 68, 'Change address is returned');
    equal(change.tokens, 4998992350, 'Got change output value');
  } else {
    equal(change.output_script.length, 68, 'Change address is returned');
    equal(change.tokens, 4998996175, 'Got change output value');
  }

  equal(output.tokens, tokens, 'Got expected tokens output');

  const {data, version} = fromBech32(address);

  const prefix = `${Buffer.from([version]).toString('hex')}14`;

  const expectedOutput = `${prefix}${data.toString('hex')}`;

  equal(output.output_script, expectedOutput, 'Got expected output script');

  const decoded = decodePsbt({ecp, psbt: funded.psbt});

  const [decodedInput] = decoded.inputs;

  equal(decodedInput.sighash_type, 1, 'PSBT has sighash all flag');
  equal(!!decodedInput.witness_utxo.script_pub, true, 'PSBT input address');
  equal(decodedInput.witness_utxo.tokens, 5000000000, 'PSBT has input tokens');

  // A Taproot script can be funded and spent with internal key + script hash
  try {
    await generate({count});

    const keyPair1 = ecp.makeRandom({network: networks.regtest});
    const keyPair2 = ecp.makeRandom({network: networks.regtest});
    const unusedKey = ecp.makeRandom({network: networks.regtest});

    const witnessScript = compile([
      from(unusedKey.publicKey).slice(1),
      OP_CHECKSIG,
    ]);

    const branches = [{script: witnessScript}];

    const {hash} = hashForTree({branches});

    // Create a combined key using public key material
    const combinedPoint = pointAdd(
      from(keyPair1.publicKey),
      from(keyPair2.publicKey)
    );

    const output = v1OutputScript({
      hash,
      internal_key: Buffer.from(combinedPoint).toString('hex'),
    });

    const [utxo] = (await getUtxos({lnd})).utxos.reverse();

    // Make a PSBT paying to the Taproot output
    const {psbt} = createPsbt({
      outputs: [{tokens, script: output.script}],
      utxos: [{id: utxo.transaction_id, vout: utxo.transaction_vout}],
    });

    // Sign the PSBT
    const signed = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, psbt})).psbt,
    });

    // Send the tx to the chain
    await broadcastChainTransaction({lnd, transaction: signed.transaction});

    // Make a new tx that will spend the output back into the wallet
    const tx = new Transaction();

    // The new tx spends the Taproot output
    tx.addInput(
      fromHex(signed.transaction).getHash(),
      fromHex(signed.transaction).outs.findIndex(n => n.value === tokens)
    );

    // Make an output to pay back into the wallet
    const chainOutput = toOutputScript(
      (await createChainAddress({lnd})).address,
      networks.regtest
    );

    // Add output to the pay back transaction
    tx.addOutput(chainOutput, smallTokens);

    const [hashToSign] = tx.ins.map((input, i) => {
      return tx.hashForWitnessV1(
        i,
        [hexAsBuffer(output.script)],
        [tokens],
        Transaction.SIGHASH_DEFAULT,
      );
    });

    // Ready for private key combining
    const combinedKey = privateAdd(
      from(keyPair1.privateKey),
      from(keyPair2.privateKey)
    );

    const signedInput = signHash({
      hash,
      private_key: Buffer.from(combinedKey).toString('hex'),
      public_key: Buffer.from(combinedPoint).toString('hex'),
      sign_hash: hashToSign.toString('hex'),
    });

    const signature = hexAsBuffer(signedInput.signature);

    // Add the signature to the input
    tx.ins.forEach((input, i) => tx.setWitness(i, [signature]));

    await broadcastChainTransaction({lnd, transaction: tx.toHex()});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const utxo = utxos.find(n => n.transaction_id === tx.getId());

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootSpend');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  }

  // A Taproot script output should be funded and spent with script
  try {
    await generate({count});

    const keyPair = ecp.makeRandom({network: networks.regtest});

    const witnessScript = compile([
      from(keyPair.publicKey.slice(1)),
      OP_CHECKSIG,
    ]);

    const branches = [{script: witnessScript}];

    const {hash} = hashForTree({branches});

    const output = v1OutputScript({hash, internal_key: defaultInternalKey});

    const [utxo] = (await getUtxos({lnd})).utxos.reverse();

    // Make a PSBT paying to the Taproot output
    const {psbt} = createPsbt({
      outputs: [{tokens, script: output.script}],
      utxos: [{id: utxo.transaction_id, vout: utxo.transaction_vout}],
    });

    // Sign the PSBT
    const signed = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, psbt})).psbt,
    });

    // Send the tx to the chain
    await broadcastChainTransaction({lnd, transaction: signed.transaction});

    // Make a new tx that will spend the output back into the wallet
    const tx = new Transaction();

    // The new tx spends the Taproot output
    tx.addInput(
      fromHex(signed.transaction).getHash(),
      fromHex(signed.transaction).outs.findIndex(n => n.value === tokens)
    );

    // Make an output to pay back into the wallet
    const chainOutput = toOutputScript(
      (await createChainAddress({lnd})).address,
      networks.regtest
    );

    // Add output to the pay back transaction
    tx.addOutput(chainOutput, smallTokens);

    const [hashToSign] = tx.ins.map((input, i) => {
      return tx.hashForWitnessV1(
        i,
        [hexAsBuffer(output.script)],
        [tokens],
        Transaction.SIGHASH_DEFAULT,
        hexAsBuffer(leafHash({script: witnessScript}).hash),
      );
    });

    const signature = from(signSchnorr(hashToSign, from(keyPair.privateKey)));

    const {block} = controlBlock({
      external_key: output.external_key,
      leaf_script: witnessScript,
      script_branches: branches,
    });

    // Add the signature to the input
    tx.ins.forEach((input, i) => {
      return tx.setWitness(i, [
        signature,
        hexAsBuffer(witnessScript),
        hexAsBuffer(block),
      ]);
    });

    await broadcastChainTransaction({lnd, transaction: tx.toHex()});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const utxo = utxos.find(n => n.transaction_id === tx.getId());

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootSpend');
      }
    });
  } catch (err) {
    await kill({});

    equal(err, null, 'Expected no error');

    return;
  }

  // A Taproot output should be funded for a regular key spend
  try {
    await generate({count});

    const keyPair = ecp.makeRandom({network: networks.regtest});

    const output = v1OutputScript({
      internal_key: from(keyPair.publicKey).toString('hex'),
    });

    const outputScript = hexAsBuffer(output.script);

    const [utxo] = (await getUtxos({lnd})).utxos.reverse();

    // Make a PSBT paying to the Taproot output
    const {psbt} = createPsbt({
      outputs: [{tokens, script: outputScript.toString('hex')}],
      utxos: [{id: utxo.transaction_id, vout: utxo.transaction_vout}],
    });

    // Sign the PSBT
    const signed = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, psbt})).psbt,
    });

    // Send the tx to the chain
    await broadcastChainTransaction({lnd, transaction: signed.transaction});

    // Make a new tx that will spend the output back into the wallet
    const tx = new Transaction();

    // The new tx spends the Taproot output
    tx.addInput(
      fromHex(signed.transaction).getHash(),
      fromHex(signed.transaction).outs.findIndex(n => n.value === tokens)
    );

    // Make an output to pay back into the wallet
    const chainOutput = toOutputScript(
      (await createChainAddress({lnd})).address,
      networks.regtest
    );

    // Add output to the pay back transaction
    tx.addOutput(chainOutput, smallTokens);

    const [hashToSign] = tx.ins.map((input, i) => {
      return tx.hashForWitnessV1(
        i,
        [outputScript],
        [tokens],
        Transaction.SIGHASH_DEFAULT,
      );
    });

    const signedInput = signHash({
      private_key: from(keyPair.privateKey).toString('hex'),
      public_key: from(keyPair.publicKey).toString('hex'),
      sign_hash: hashToSign.toString('hex'),
    });

    const signature = hexAsBuffer(signedInput.signature);

    // Add the signature to the input
    tx.ins.forEach((input, i) => tx.setWitness(i, [Buffer.from(signature)]));

    await broadcastChainTransaction({lnd, transaction: tx.toHex()});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const utxo = utxos.find(n => n.transaction_id === tx.getId());

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootSpend');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  }

  await kill({});
});
