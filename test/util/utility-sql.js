'use strict';
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { Manager } = require('../../index');
const TestDialect = require('../dialects/test-dialect');
const UtilOpts = require('./utility-options');
const Fs = require('fs/promises');
const Path = require('path');
const Stream = require('stream');
const READ_SQL_PATH = Path.resolve(process.cwd(), 'test/db/read.some.tables.sql');
const READ_NO_PREFIX_SQL_PATH = Path.resolve(process.cwd(), 'test/db/no.prefix.some.tables.sql');
function clone(value) {
 return JSON.parse(JSON.stringify(value));
}
async function readStream(stream) {
 const rows = [];
 for await (const row of stream) rows.push(row);
 return rows;
}
class UtilSql {
 static async initConf(mainPath) {
  return clone(UtilOpts.getConf(mainPath));
 }
 static async initManager(priv, conf, initOpts = {}) {
  const { cache, logger, mgr, skipPrepFuncs } = initOpts;
  priv.cache = cache || null;
  priv.mgr = mgr || new Manager(conf, priv.cache, logger || false);
  if (!conf) return;
  priv.closeConnNames = conf.db.connections.map(conn => conn.name);
  const conn = conf.db.connections[0];
  const cname = conn.name;
  const initReturnsErrors = Object.prototype.hasOwnProperty.call(initOpts, 'returnErrors');
  const initResults = initReturnsErrors ? await priv.mgr.init(initOpts.returnErrors) : await priv.mgr.init();
  assert.equal(typeof initResults, 'object');
  assert.equal(typeof initResults.result, 'object');
  if (initOpts.returnErrors && conn.driverOptions && conn.driverOptions.throwInitError) {
   assert.ok(Array.isArray(initResults.errors));
   assert.equal(initResults.errors.length, conf.db.connections.length);
   for (const err of initResults.errors) assert.ok(err instanceof Error);
  } else {
   for (const iname of Object.keys(initResults.result)) {
    const found = conf.db.connections.find(cconn => cconn.name === iname);
    assert.equal(iname, found && found.name);
   }
  }
  UtilSql.expectManagerDB(priv.mgr, cname, skipPrepFuncs);
 }
 static expectManagerDB(mgr, cname, skipPrepFuncs) {
  assert.equal(typeof mgr.db, 'object');
  assert.equal(typeof mgr.db[cname], 'object');
  if (skipPrepFuncs) return;
  assert.equal(typeof mgr.db[cname].read, 'object');
  assert.equal(typeof mgr.db[cname].read.some, 'object');
  assert.equal(typeof mgr.db[cname].read.some.tables, 'function');
  assert.equal(typeof mgr.db[cname].finance, 'object');
  assert.equal(typeof mgr.db[cname].finance.read, 'object');
  assert.equal(typeof mgr.db[cname].finance.read.annual, 'object');
  assert.equal(typeof mgr.db[cname].finance.read.annual.report, 'function');
  assert.equal(typeof mgr.db[cname].finance.create, 'object');
  assert.equal(typeof mgr.db[cname].finance.create.annual, 'object');
  assert.equal(typeof mgr.db[cname].finance.create.annual.report, 'function');
  assert.equal(typeof mgr.db[cname].finance.ap, 'object');
  assert.equal(typeof mgr.db[cname].finance.ap.delete, 'object');
  assert.equal(typeof mgr.db[cname].finance.ap.delete.audits, 'function');
  assert.equal(typeof mgr.db[cname].finance.ap.update, 'object');
  assert.equal(typeof mgr.db[cname].finance.ap.update.audits, 'function');
  assert.equal(typeof mgr.db[cname].finance.ar, 'object');
  assert.equal(typeof mgr.db[cname].finance.ar.delete, 'object');
  assert.equal(typeof mgr.db[cname].finance.ar.delete.audits, 'function');
  assert.equal(typeof mgr.db[cname].finance.ar.update, 'object');
  assert.equal(typeof mgr.db[cname].finance.ar.update.audits, 'function');
  assert.equal(typeof mgr.db[cname].no, 'object');
  assert.equal(typeof mgr.db[cname].no.prefix, 'object');
  assert.equal(typeof mgr.db[cname].no.prefix.some, 'object');
  assert.equal(typeof mgr.db[cname].no.prefix.some.tables, 'function');
 }
 static getPreparedFunction(mgr, connName, path) {
  return path.split('.').reduce((acc, key) => acc[key], mgr.db[connName]);
 }
 static async expectResults(label, execOpts, expectedRowsType, rslt, streamName, expectedCount = 2) {
  assert.equal(typeof rslt, 'object', `${label} result`);
  assert.ok(Array.isArray(rslt.rows), `${label} rows`);
  assert.equal(rslt.rows.constructor.name, expectedRowsType || Array.name);
  if (streamName) {
   assert.equal(rslt.rows.length, 1);
   assert.equal(rslt.rows[0].constructor.name, streamName);
   const rows = await readStream(rslt.rows[0]);
   assert.equal(rows.length, expectedCount);
   for (const row of rows) assert.equal(typeof row, 'object');
   return;
  }
  assert.equal(rslt.rows.length, expectedCount);
  for (const row of rslt.rows) assert.equal(typeof row, 'object');
 }
 static async testOperation(op, mgr, connName, expected, label) {
  let rslt;
  if (op === 'state') rslt = await mgr.state(undefined, connName);
  else if (op === 'preparedFunctionCount') rslt = await mgr.preparedFunctionCount(connName);
  else if (op === 'scan') rslt = await mgr.scan(true, connName);
  else rslt = await mgr[op](connName);
  assert.equal(typeof rslt, 'object', `${label || op} result`);
  assert.equal(typeof rslt.result, 'object', `${label || op} result.result`);
  const actual = rslt.result[connName];
  for (const key of Object.keys(expected || {})) assert.deepEqual(actual[key], expected[key], `${label || op}.${key}`);
  return rslt;
 }
 static async sqlFile(contents, noPrefix = false) {
  const file = noPrefix ? READ_NO_PREFIX_SQL_PATH : READ_SQL_PATH;
  if (typeof contents === 'undefined') return Fs.readFile(file, 'utf8');
  await Fs.writeFile(file, contents, 'utf8');
  return contents;
 }
 static async testRead(mgr, connName, testReadOpts = {}) {
  const { cache, cacheOpts, connOpts, execOpts, errorOpts, frags, prepFuncPaths = { read: 'read.some.tables', readNoPrefix: 'no.prefix.some.tables' } } = testReadOpts;
  const opts = typeof execOpts === 'undefined' ? UtilOpts.createExecOpts() : execOpts;
  const optsNoPrefix = prepFuncPaths.readNoPrefix ? clone(opts || {}) : null;
  if (optsNoPrefix) optsNoPrefix.type = 'READ';
  const performRead = async (path, currentOpts, currentFrags) => {
   const pfunc = UtilSql.getPreparedFunction(mgr, connName, path);
   assert.equal(typeof pfunc, 'function');
   const rslt = await pfunc(currentOpts, currentFrags, errorOpts);
   const throwOpt = UtilOpts.driverOpt('throwExecError', currentOpts, connOpts);
   if ((errorOpts === true || (errorOpts && errorOpts.returnErrors)) && throwOpt.source && throwOpt.value) {
    assert.ok(rslt.error instanceof Error);
    assert.equal(typeof rslt.error.sqler, 'object');
    const throwPropOpt = UtilOpts.driverOpt('throwProperties', currentOpts, connOpts);
    if (throwPropOpt.source && throwPropOpt.value) {
     for (const prop of Object.keys(throwPropOpt.value)) assert.equal(rslt.error.sqler[prop], throwPropOpt.value[prop]);
    }
    return;
   }
   const rcdCntOpt = UtilOpts.driverOpt('recordCount', currentOpts, connOpts);
   const rcdCnt = (rcdCntOpt.source && rcdCntOpt.value) || 2;
   await UtilSql.expectResults(path, currentOpts, Array.name, rslt, Number.isInteger(currentOpts && currentOpts.stream) && currentOpts.stream >= 0 ? Stream.Readable.name : null, rcdCnt);
  };
  await performRead(prepFuncPaths.read, opts, frags);
  if (prepFuncPaths.readNoPrefix) await performRead(prepFuncPaths.readNoPrefix, optsNoPrefix, frags);
  const sql = await UtilSql.sqlFile();
  let sqlNoPrefix;
  if (prepFuncPaths.readNoPrefix) sqlNoPrefix = await UtilSql.sqlFile(undefined, true);
  try {
   opts.driverOptions = opts.driverOptions || {};
   const singleRecordKey = '\nORDER BY *';
   opts.driverOptions.singleRecordKey = singleRecordKey;
   await UtilSql.sqlFile(`${sql}${singleRecordKey}`);
   if (prepFuncPaths.readNoPrefix) await UtilSql.sqlFile(`${sqlNoPrefix}${singleRecordKey}`, true);
   await delay(cacheOpts && Object.prototype.hasOwnProperty.call(cacheOpts, 'expiresIn') ? cacheOpts.expiresIn : 1000);
   const origRcdCnt = opts.driverOptions.recordCount;
   opts.driverOptions.recordCount = cache ? 1 : 2;
   await performRead(prepFuncPaths.read, opts, frags);
   if (prepFuncPaths.readNoPrefix) await performRead(prepFuncPaths.readNoPrefix, optsNoPrefix, frags);
   opts.driverOptions.recordCount = origRcdCnt;
   await UtilSql.testOperation('state', mgr, connName, { pending: 0 }, 'state');
  } finally {
   try {
    await UtilSql.sqlFile(sql);
   } finally {
    if (prepFuncPaths.readNoPrefix && typeof sqlNoPrefix !== 'undefined') await UtilSql.sqlFile(sqlNoPrefix, true);
   }
  }
 }
}
module.exports = UtilSql;