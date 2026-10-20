import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManage, isRank, RANKS, rankName } from './ranks.ts';

test('rank names round-trip', () => {
  assert.equal(rankName(1), 'cashier');
  assert.equal(rankName(RANKS.manager), 'manager');
  assert.equal(isRank(4), true);
  assert.equal(isRank(0), false);
  assert.equal(isRank('2'), false);
});

test('higher ranks manage lower ranks; managers do not manage peers', () => {
  assert.equal(canManage(RANKS.manager, RANKS.admin), true);
  assert.equal(canManage(RANKS.manager, RANKS.manager), false);
  assert.equal(canManage(RANKS.admin, RANKS.manager), false);
  assert.equal(canManage(RANKS.developer, RANKS.developer), true);
});
