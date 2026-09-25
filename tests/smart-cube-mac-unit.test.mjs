import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRememberedMac, rememberMac, forgetRememberedMac } from '../src/smart-cube-mac.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

test('verified cube MAC can be recalled by Bluetooth name and forgotten', () => {
  const storage = memoryStorage();
  rememberMac('GAN16ui_1234', 'AA:BB:CC:DD:EE:FF', storage);
  assert.equal(getRememberedMac('GAN16ui_1234', storage), 'AA:BB:CC:DD:EE:FF');
  assert.equal(getRememberedMac('another cube', storage), null);
  forgetRememberedMac('GAN16ui_1234', storage);
  assert.equal(getRememberedMac('GAN16ui_1234', storage), null);
});

test('invalid addresses and unavailable storage are ignored', () => {
  const storage = memoryStorage();
  rememberMac('GAN16ui', 'wrong', storage);
  assert.equal(getRememberedMac('GAN16ui', storage), null);
  const unavailable = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  assert.equal(getRememberedMac('GAN16ui', unavailable), null);
  assert.doesNotThrow(() => rememberMac('GAN16ui', 'AABBCCDDEEFF', unavailable));
  assert.doesNotThrow(() => forgetRememberedMac('GAN16ui', unavailable));
});
