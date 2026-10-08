import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseMac } from '../src/smart-cube-mac.js';

// A real Android recording showed every manual connect failing with
// "GAN gen2-4 requires a valid 6-byte Bluetooth MAC". The old normaliser inserted
// a colon after every two CHARACTERS, so a MAC typed in the form the placeholder
// asks for became AA::B:B::CC::D:D::EE::F:F. Only the separator-less form worked.
test('every way a person might type a MAC normalises to AA:BB:CC:DD:EE:FF', () => {
  for (const input of ['AA:BB:CC:DD:EE:FF', 'aa:bb:cc:dd:ee:ff', 'AABBCCDDEEFF', 'aabbccddeeff',
                       'AA-BB-CC-DD-EE-FF', 'aa bb cc dd ee ff', ' AA:BB:CC:DD:EE:FF ']) {
    assert.equal(normaliseMac(input), 'AA:BB:CC:DD:EE:FF', `failed for ${JSON.stringify(input)}`);
  }
});

test('anything that is not six bytes of hex normalises to empty', () => {
  for (const input of ['nonsense', '', null, undefined, 'AA:BB:CC:DD:EE', 'AA:BB:CC:DD:EE:FF:00']) {
    assert.equal(normaliseMac(input), '');
  }
});
