'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('../../index');
const IntervalCache = require('../cache/interval-cache');
const Fs = require('fs');
const { expect } = require('@hapi/code');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from '../../index.mjs';
// TODO : import * as IntervalCache from '../cache/interval-cache.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import { expect } from '@hapi/code';

const priv = { mgr: null, cache: null };

// TODO : ESM uncomment the following line...
// export
class Tester {

  static async beforeEach() {
    const cch = priv.cache;
    priv.mgr = priv.cache = null;
    if (cch && cch.start) await cch.start();
  }

  static async afterEach() {
    const mgr = priv.mgr, cch = priv.cache, error = priv.error;
    priv.mgr = priv.cache = priv.error = null;
    const proms = [];
    if (mgr && !error) proms.push(testOperation('close', mgr, 'tst', 1));
    if (cch && cch.stop) proms.push(cch.stop());
    return Promise.all(proms);
  }

  static async noCache() {
    const conf = getConf(), connName = 'tst';
    await initManager(conf);

    try {
      await testRead(priv.mgr, connName);
    } catch (err) {
      priv.error = err;
      throw err;
    }
  }

  static async intervalCache() {
    const cacheOpts = { expiresIn: 100 };
    const conf = getConf(), connName = 'tst';
    await initManager(conf, new IntervalCache(cacheOpts));

    try {
      await testRead(priv.mgr, connName, priv.cache, cacheOpts);

      let xopts = createExecOpts(), pendingCount;
      pendingCount = await testCUD(priv.mgr, connName, conf, xopts);
      await testOperation('commit', priv.mgr, connName, pendingCount);

      if (LOGGER.info) LOGGER.info('>> CUD tests using autocommit = true');
      xopts.driverOptions = { autocommit: true };
      pendingCount = await testCUD(priv.mgr, connName, conf, xopts);
    } catch (err) {
      priv.error = err;
      throw err;
    }
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

function getConf() {
  const conf = {
    "mainPath": 'test',
    "univ": {
      "db": {
        "testId": {
          "host": "myhost.example.com",
          "username": "myusername",
          "password": "mypassword"
        }
      }
    },
    "db": {
      "dialects": {
        "test": './test/dialects/test-dialect'
      },
      "connections": [
        {
          "id": "testId",
          "name": "tst",
          "dir": "db",
          "service": "TESTSRV",
          "dialect": "test",
          "driverOptions": {
            "numOfPreparedStmts": 7,
            "autocommit": false
          }
        }
      ]
    }
  };
  return conf;
}

/**
 * @returns {Object} The test execution options to pass into {@link Manager.execute}
 */
function createExecOpts() {
  return { binds: { someCol1: 1, someCol2: 2, someCol3: 3 } };
}

/**
 * Gets a connection by name in a specified configuration
 * @param {Object} conf The {@link #getConf} object
 * @param {String} name The connection name to find
 * @returns {Object} The connection configuration object that matches the specified name
 */
function getConnConf(conf, name) {
  for (let conn of conf.db.connections) {
    if (conn.name === name) return conn;
  }
}

/**
 * Sets a generated manager using the specified cache and validates the test SQL functions are generated
 * @param {Object} conf The manager configuration
 * @param {Cache} [cache] The cache to use for the manager
 */
async function initManager(conf, cache) {
  priv.cache = cache;
  priv.mgr = new Manager(conf, priv.cache, !!LOGGER.info);
  await priv.mgr.init();

  expect(priv.mgr.db, 'priv.mgr.db').to.be.object();
  expect(priv.mgr.db.tst, 'priv.mgr.db.tst').to.be.object();

  expect(priv.mgr.db.tst.read, 'priv.mgr.db.tst.read').to.be.object();
  expect(priv.mgr.db.tst.read.some, 'priv.mgr.db.tst.read.some').to.be.object();
  expect(priv.mgr.db.tst.read.some.tables, 'priv.mgr.db.tst.read.some.tables').to.be.function();

  expect(priv.mgr.db.tst.finance, 'priv.mgr.db.tst.finance').to.be.object();

  expect(priv.mgr.db.tst.finance.read, 'priv.mgr.db.tst.finance.read').to.be.object();
  expect(priv.mgr.db.tst.finance.read.annual, 'priv.mgr.db.tst.finance.read.annual').to.be.object();
  expect(priv.mgr.db.tst.finance.read.annual.report, 'priv.mgr.db.tst.finance.read.annual.report').to.be.function();

  expect(priv.mgr.db.tst.finance.create, 'priv.mgr.db.tst.finance.create').to.be.object();
  expect(priv.mgr.db.tst.finance.create.annual, 'priv.mgr.db.tst.finance.create.annual').to.be.object();
  expect(priv.mgr.db.tst.finance.create.annual.report, 'priv.mgr.db.tst.finance.create.annual.report').to.be.function();

  expect(priv.mgr.db.tst.finance.ap, 'priv.mgr.db.tst.finance.ap').to.be.object();

  expect(priv.mgr.db.tst.finance.ap.delete, 'priv.mgr.db.tst.finance.ap.delete').to.be.object();
  expect(priv.mgr.db.tst.finance.ap.delete.audits, 'priv.mgr.db.tst.finance.ap.delete.audits').to.be.function();

  expect(priv.mgr.db.tst.finance.ap.update, 'priv.mgr.db.tst.finance.ap.update').to.be.object();
  expect(priv.mgr.db.tst.finance.ap.update.audits, 'priv.mgr.db.tst.finance.ap.update.audits').to.be.function();

  expect(priv.mgr.db.tst.finance.ar, 'priv.mgr.db.tst.finance.ar').to.be.object();

  expect(priv.mgr.db.tst.finance.ar.delete, 'priv.mgr.db.tst.finance.ar.delete').to.be.object();
  expect(priv.mgr.db.tst.finance.ar.delete.audits, 'priv.mgr.db.tst.finance.ar.delete.audits').to.be.function();

  expect(priv.mgr.db.tst.finance.ar.update, 'priv.mgr.db.tst.finance.ar.update').to.be.object();
  expect(priv.mgr.db.tst.finance.ar.update.audits, 'priv.mgr.db.tst.finance.ar.update.audits').to.be.function();

}

/**
 * Tests that `read` SQL statements work with and w/o {@link Cache} by re-writting the SQL file to see if the cahce picks it up
 * @param {Manager} mgr The {@link Manager} that will be used
 * @param {String} connName The connection name to use
 * @param {Cache} [cache] the {@link Cache} that will be used for SQL statements
 * @param {Object} [cacheOpts] the options that were used on the specified {@link Cache}
 * @returns {(Error | undefined)} An error when the test fails
 */
async function testRead(mgr, connName, cache, cacheOpts) {
  if (LOGGER.info) LOGGER.info(`Begin basic test`);

  const opts = createExecOpts(), label = `READ mgr.db.${connName}.read.some.tables`;
  const rslt1 = await mgr.db[connName].read.some.tables(opts, ['test-frag']);
  
  expect(rslt1).to.be.array();
  expect(rslt1).to.be.length(2); // two records should be returned w/o order by
  if (LOGGER.info) LOGGER.info(`${label} BEFORE cache update:`, rslt1);
  
  
  // change the SQL file
  const sql = (await sqlFile()).toString();
  try {
    // update the file
    await sqlFile(`${sql}\nORDER BY SOME_COL1`);

    // wait for the the SQL statement to expire
    await Labrat.wait(cacheOpts && cacheOpts.hasOwnProperty('expiresIn') ? cacheOpts.expiresIn : 1000);

    const frags = cache ? ['test-frag'] : null;
    const rslt2 = await mgr.db[connName].read.some.tables(opts, frags);

    expect(rslt2).to.be.array();
    expect(rslt2).to.be.length(cache ? 1 : 2); // one record w/order by and updated by cache
    if (LOGGER.info) LOGGER.info(`${label} AFTER cache update:`, rslt2);

    // no commits, only reads
    await testOperation('pendingCommit', mgr, connName, 0, label);
    await testOperation('commit', mgr, connName, 0, label);
  } finally {
    await sqlFile(sql);
  }
}

/**
 * Tests create, update, delete
 * @param {Manager} mgr The manager
 * @param {String} connName The connection name to use
 * @param {Object} conf The {@link #getConf} object
 * @param {Manager~ExecOptions} xopts The execution options
 * @returns {Integer} The number of pending commits
 */
async function testCUD(mgr, connName, conf, xopts) {
  let autocommit = xopts && xopts.driverOptions && xopts.driverOptions.autocommit;
  if (!xopts || !xopts.driverOptions || !xopts.driverOptions.hasOwnProperty('autocommit')) {
    const tst = getConnConf(conf, connName);
    autocommit = tst.driverOptions && tst.driverOptions.autocommit;
  }
  
  let pendCnt = 0, cudRslt, label;

  cudRslt = await mgr.db.tst.finance.create.annual.report(xopts);
  label = 'CREATE mgr.db.tst.finance.create.annual.report()';
  expect(cudRslt, `${label} result`).to.be.undefined();
  await testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);
  
  cudRslt = await mgr.db.tst.finance.ap.update.audits(xopts);
  label = 'UPDATE mgr.db.tst.finance.ap.update.audits()';
  expect(cudRslt, `${label} result`).to.be.undefined();
  await testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

  return pendCnt;
}

/**
 * Tests if the specified operation and operation result
 * @param {String} type The type of manager operation to test (e.g. `rollback`, `commit`, `close`, etc.)
 * @param {String} connName The connection name to use
 * @param {*} expected The expected result
 * @param {String} [label] A label to use for the operation
 * @returns {Object} The operation result
 */
async function testOperation(type, mgr, connName, expected, label) {
  const rslt = await mgr[type]();
  expect(rslt, `${label || 'DB'} ${type} result`).to.be.object();
  expect(rslt[connName], `${label || 'DB'} ${type} result`).to.equal(expected);
  return rslt;
} 

/**
 * Reads/writes test SQL file
 * @param {String} [sql] The SQL to write to the test file (omit to just read file)
 */
async function sqlFile(sql) {
  const sqlPath = './test/db/read.some.tables.sql';
  if (typeof sql === 'string') {
    return Fs.promises.writeFile(sqlPath, sql);
  } else {
    return Fs.promises.readFile(sqlPath);
  }
}

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}