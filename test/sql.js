'use strict';
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Tester = require('./lib/sql');
const TEST_TKO = 10000;
async function expectFailure(fn) {
 await assert.rejects(async () => {
  await Promise.resolve().then(() => fn());
 });
}
if (Tester.before) before(Tester.before);
if (Tester.after) after(Tester.after);
if (Tester.beforeEach) beforeEach(Tester.beforeEach);
if (Tester.afterEach) afterEach(Tester.afterEach);
test('DB Manager: Read', { timeout: TEST_TKO }, async () => { await Tester.read(); });
test('DB Manager: Read With Add Connection', { timeout: TEST_TKO }, async () => { await Tester.readWithAddConnection(); });
test('DB Manager: Read With Set Cache Throw Error', async () => { await Tester.readWithSetCacheThrow(); });
test('DB Manager: Read With Set Cache', { timeout: TEST_TKO }, async () => { await Tester.readWithSetCache(); });
test('DB Manager: Read Return Error', { timeout: TEST_TKO }, async () => { await Tester.readErrorReturn(); });
test('DB Manager: Read Throw Error', async () => { await expectFailure(Tester.readErrorThrow); });
test('DB Manager: Read With SQL Dialect Substitutions', { timeout: TEST_TKO }, async () => { await Tester.readWithSubstitutionsDialects(); });
test('DB Manager: Read With SQL Version = -1 Substitutions', { timeout: TEST_TKO }, async () => { await Tester.readWithSubstitutionsVersionNegative1(); });
test('DB Manager: Read With SQL Version = 1 Substitutions', { timeout: TEST_TKO }, async () => { await Tester.readWithSubstitutionsVersion1(); });
test('DB Manager: Read With SQL Version = 2 Substitutions', { timeout: TEST_TKO }, async () => { await Tester.readWithSubstitutionsVersion2(); });
test('DB Manager: Read With SQL Fragment Substitutions', { timeout: TEST_TKO }, async () => { await Tester.readWithSubstitutionsFrags(); });
test('DB Manager: Read With Stream.Readable[]', { timeout: TEST_TKO }, async () => { await Tester.readStream(); });
test('DB Manager: Execution Options Missing Transaction Error', async () => { await expectFailure(Tester.execOptsAutoCommitFalseTransactionMissing); });
test('DB Manager: Execution Options Missing Transaction ID Error', async () => { await expectFailure(Tester.execOptsAutoCommitFalseTransactionIdMissing); });
test('DB Manager: Prepared Statements', { timeout: TEST_TKO }, async () => { await Tester.execOptsPreparedStatements(); });
test('DB Manager: Write With Stream.Writable', { timeout: TEST_TKO }, async () => { await Tester.writeStream(); });
test('DB Manager: Interval Cache', { timeout: TEST_TKO }, async () => { await Tester.intervalCache(); });
test('DB Manager: Scan SQL Files', { timeout: TEST_TKO }, async () => { await Tester.scan(); });
test('DB Manager: No Execution Options', { timeout: TEST_TKO }, async () => { await Tester.execOptsNone(); });
