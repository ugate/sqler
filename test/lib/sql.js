'use strict';
const assert = require('node:assert/strict');
const Fs = require('fs/promises');
const Path = require('path');
const Stream = require('stream');
const UtilOpts = require('../util/utility-options');
const UtilSql = require('../util/utility-sql');
const IntervalCache = require('../cache/interval-cache');

const test = {
 mgr: null,
 cache: null,
 conf: null,
 connName: 'tst',
 mgrLogit: typeof console.info === 'function'
};

async function setup(confMutator, initOpts = {}) {
 test.conf = await UtilSql.initConf();
 if (typeof confMutator === 'function') confMutator(test.conf);
 await UtilSql.initManager(test, test.conf, initOpts);
 test.connName = test.conf.db.connections[0].name;
 return test;
}

async function teardown() {
 try {
  if (test.mgr) await test.mgr.close();
 } finally {
  test.mgr = null;
  if (test.cache && typeof test.cache.stop === 'function') await test.cache.stop();
  test.cache = null;
 }
}

class Tester {
 static async after() {
  await teardown();
 }

 static async afterEach() {
  await teardown();
 }

 static async read() {
  await setup();
  await UtilSql.testRead(test.mgr, test.connName);
 }

 static async readWithAddConnection() {
  await setup();
  const conf = await UtilSql.initConf();
  const conn = JSON.parse(JSON.stringify(conf.db.connections[0]));
  conn.id = 'testId2';
  conn.name = 'tst2';
  const priv = JSON.parse(JSON.stringify(conf.univ.db.testId));
  const rslt = await test.mgr.addConnection(conn, priv, null, false);
  assert.equal(rslt.result[conn.name], true);
  UtilSql.expectManagerDB(test.mgr, conn.name, false);
  await UtilSql.testRead(test.mgr, conn.name);
 }

 static async readWithSetCacheThrow() {
  await setup();
  const rslt = await test.mgr.setCache(true, false, test.connName);
  assert.equal(typeof rslt, 'object');
  assert.equal(typeof rslt.result, 'object');
 }

 static async readWithSetCache() {
  await setup();
  test.cache = new IntervalCache({ expiresIn: 150 });
  const rslt = await test.mgr.setCache(test.cache, true, test.connName);
  assert.equal(typeof rslt.result[test.connName], 'number');
  await UtilSql.testRead(test.mgr, test.connName, { cache: test.cache, cacheOpts: { expiresIn: 150 } });
 }

 static async readErrorReturn() {
  await setup(conf => {
   conf.db.connections[0].driverOptions.throwExecError = true;
   conf.db.connections[0].driverOptions.throwProperties = { reason: 'forced-exec-error' };
  });
  const pfunc = UtilSql.getPreparedFunction(test.mgr, test.connName, 'read.some.tables');
  const rslt = await pfunc(UtilOpts.createExecOpts(false), null, { returnErrors: true });
  assert.ok(rslt && rslt.error instanceof Error);
 }

 static async readErrorThrow() {
  await setup(conf => {
   conf.db.connections[0].driverOptions.throwExecError = true;
  });
  const pfunc = UtilSql.getPreparedFunction(test.mgr, test.connName, 'read.some.tables');
  await pfunc(UtilOpts.createExecOpts(false));
 }

 static async readWithSubstitutionsDialects() {
  await setup(conf => {
   conf.db.connections[0].substitutes = UtilOpts.createSubstituteOpts();
   conf.db.connections[0].driverOptions = {
    ...conf.db.connections[0].driverOptions,
    ...UtilOpts.createSubstituteDriverOptsDialects()
   };
  });
  await UtilSql.testRead(test.mgr, test.connName);
 }

 static async readWithSubstitutionsVersionNegative1() {
  await setup(conf => {
   conf.db.connections[0].version = -1;
   conf.db.connections[0].driverOptions = {
    ...conf.db.connections[0].driverOptions,
    ...UtilOpts.createSubstituteDriverOptsVersions([-1], [1, 2])
   };
  });
  await UtilSql.testRead(test.mgr, test.connName);
 }

 static async readWithSubstitutionsVersion1() {
  await setup(conf => {
   conf.db.connections[0].version = 1;
   conf.db.connections[0].driverOptions = {
    ...conf.db.connections[0].driverOptions,
    ...UtilOpts.createSubstituteDriverOptsVersions([1], [-1, 2])
   };
  });
  await UtilSql.testRead(test.mgr, test.connName);
 }

 static async readWithSubstitutionsVersion2() {
  await setup(conf => {
   conf.db.connections[0].version = 2;
   conf.db.connections[0].driverOptions = {
    ...conf.db.connections[0].driverOptions,
    ...UtilOpts.createSubstituteDriverOptsVersions([2], [-1, 1])
   };
  });
  await UtilSql.testRead(test.mgr, test.connName);
 }

 static async readWithSubstitutionsFrags() {
  await setup(conf => {
   conf.db.connections[0].driverOptions = {
    ...conf.db.connections[0].driverOptions,
    ...UtilOpts.createSubstituteDriverOptsFrags()
   };
  });
  await UtilSql.testRead(test.mgr, test.connName, { frags: ['myFragKey'] });
 }

 static async readStream() {
  await setup();
  await UtilSql.testRead(test.mgr, test.connName, {
   execOpts: {
    ...UtilOpts.createExecOpts(false),
    stream: 0,
    type: 'READ'
   }
  });
 }

 static async execOptsAutoCommitFalseTransactionMissing() {
  await setup();
  const pfunc = UtilSql.getPreparedFunction(test.mgr, test.connName, 'read.some.tables');
  await pfunc({ ...UtilOpts.createExecOpts(false), autoCommit: false });
 }

 static async execOptsAutoCommitFalseTransactionIdMissing() {
  await setup();
  const pfunc = UtilSql.getPreparedFunction(test.mgr, test.connName, 'read.some.tables');
  await pfunc({ ...UtilOpts.createExecOpts(false), autoCommit: false, transactionId: '' });
 }

 static async execOptsPreparedStatements() {
  await setup();
  const pfunc = UtilSql.getPreparedFunction(test.mgr, test.connName, 'read.some.tables');
  const txId = 'tx-prepared-1';
  const tx = await test.mgr.db[test.connName].beginTransaction({ transactionId: txId });
  const rslt = await pfunc({
   ...UtilOpts.createExecOpts(false),
   prepareStatement: true,
   transactionId: txId,
   autoCommit: false
  });
  await UtilSql.expectResults('prepared statements', { type: 'READ' }, Array.name, rslt, null, 2);
  await tx.commit(true);
  const state = await test.mgr.state(undefined, test.connName);
  assert.equal(state.result[test.connName].pending, 0);
 }

 static async writeStream() {
  await setup();
  const pfunc = UtilSql.getPreparedFunction(test.mgr, test.connName, 'finance.create.annual.report');
  const rslt = await pfunc({ stream: 0, type: 'CREATE' });
  assert.ok(rslt && Array.isArray(rslt.rows) && rslt.rows.length === 1);
  const writable = rslt.rows[0];
  assert.ok(writable instanceof Stream.Writable);
  writable.write({ someCol1: 1, someCol2: 2, someCol3: 3 });
  writable.end();
 }

 static async intervalCache() {
  await setup();
  test.cache = new IntervalCache({ expiresIn: 150 });
  await test.cache.start();
  await test.mgr.setCache(test.cache, true, test.connName);
  await UtilSql.testRead(test.mgr, test.connName, { cache: test.cache, cacheOpts: { expiresIn: 150 } });
  await test.cache.stop();
 }

 static async scan() {
  await setup();
  const connName = test.connName;
  const original = await test.mgr.preparedFunctionCount(connName);
  assert.equal(typeof original.result[connName], 'number');
  const tempSqlPath = Path.resolve(process.cwd(), 'test/db/read.temp.scan.sql');
  const tempSql = 'SELECT TDB.SOME_COL1, TDB.SOME_COL2, TDB.SOME_COL3 FROM TEST_DB TDB WHERE TDB.SOME_COL1 = :someCol1';
  await Fs.writeFile(tempSqlPath, tempSql, 'utf8');
  try {
   const added = await test.mgr.scan(true, connName);
   assert.equal(added.result[connName], original.result[connName] + 1);
  } finally {
   await Fs.unlink(tempSqlPath).catch(() => {});
  }
  const removed = await test.mgr.scan(true, connName);
  assert.equal(removed.result[connName], original.result[connName]);
 }

 static async execOptsNone() {
  await setup();
  const pfunc = UtilSql.getPreparedFunction(test.mgr, test.connName, 'read.some.tables');
  const rslt = await pfunc();
  await UtilSql.expectResults('no execution options', { type: 'READ' }, Array.name, rslt, null, 2);
 }
}

module.exports = Tester;
