import test from 'node:test';
import assert from 'node:assert/strict';
import { CORNER_VIEW_POSES, chooseCornerView } from '../src/corner-view.js';

test('corner poses cover nearby cardinal and diagonal views within safe bounds',()=>{
  assert.deepEqual(CORNER_VIEW_POSES.map(item=>item.id),['center','left','right','up','down','left-up','right-up','left-down','right-down']);
  assert.ok(CORNER_VIEW_POSES.every(item=>Math.abs(item.yaw)<=8&&Math.abs(item.pitch)<=4.5));
  assert.ok(Math.max(...CORNER_VIEW_POSES.map(item=>Math.abs(item.pitch)))<Math.max(...CORNER_VIEW_POSES.map(item=>Math.abs(item.yaw))));
});

test('successive corner cases cannot repeat the exact camera pose',()=>{
  for(const previous of CORNER_VIEW_POSES) {
    assert.notEqual(chooseCornerView(previous.id,()=>0).id,previous.id);
    assert.notEqual(chooseCornerView(previous.id,()=>.999999).id,previous.id);
  }
});
