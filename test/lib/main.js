'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('../../index');
const IntervalCache = require('../cache/interval-cache');
const TestDialect = require('../../test/dialects/test-dialect');
const Fs = require('fs');
const { expect } = require('@hapi/code');
const { format } = require('util');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from '../../index.mjs';
// TODO : import * as IntervalCache from '../cache/interval-cache.mjs';
// TODO : import * as TestDialect from '../test/dialects/test-dialect.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import { expect } from '@hapi/code';
// TODO : import { format } from 'util';

const priv = { mgr: null, cache: null, mgrLogit: !!LOGGER.info };

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
    if (mgr && !error && priv.closeConnNames) {
      for (let cname of priv.closeConnNames) {
        proms.push(testOperation('close', mgr, cname, 1, `afterEach() connection "${cname}"`));
      }
    }
    if (cch && cch.stop) proms.push(cch.stop());
    return Promise.all(proms);
  }

  static async valConfMissing() {
    return initManager();
  }

  static async valUnivNull() {
    const conf = getConf();
    conf.univ = null;
    return initManager(conf);
  }

  static async valUnivDbNull() {
    const conf = getConf();
    conf.univ.db = null;
    return initManager(conf);
  }

  static async valUnivDbEmpty() {
    const conf = getConf();
    conf.univ.db = {};
    return initManager(conf);
  }

  static async valHostNull() {
    const conf = getConf();
    conf.univ.db.testId.host = null;
    return initManager(conf);
  }

  static async valDbNull() {
    const conf = getConf();
    conf.db = null;
    await initManager(conf);
  }

  static async valDialectsNull() {
    const conf = getConf();
    conf.db.dialects = null;
    await initManager(conf);

    conf = getConf();
    conf.db.dialects = {};
    return initManager(conf);
  }

  static async valDialectsEmpty() {
    const conf = getConf();
    conf.db.dialects = {};
    await initManager(conf);
  }

  static async valLoggers() {
    const conf = getConf();
    await initManager(conf, null, false);
    return initManager(conf, null, generateTestAbyssLogger);
  }

  static async valConnectionsNull() {
    const conf = getConf();
    conf.db.connections = null;
    return initManager(conf);
  }

  static async valConnectionsEmpty() {
    const conf = getConf();
    conf.db.connections = [];
    return initManager(conf);
  }

  static async valConnectionsIdMissing() {
    const conf = getConf();
    delete conf.db.connections[0].id;
    return initManager(conf);
  }

  static async valConnectionsNameMissing() {
    const conf = getConf();
    delete conf.db.connections[0].name;
    return initManager(conf);
  }

  static async valConnectionsDirMissing() {
    const conf = getConf();
    conf.db.connections[0].name = conf.db.connections[0].dir;
    delete conf.db.connections[0].dir;
    return initManager(conf);
  }

  static async valConnectionsDialectMissing() {
    const conf = getConf();
    conf.db.connections = [{ id: 'fakeId' }];
    return initManager(conf);
  }

  static async valConnectionsDialectinvalid() {
    const conf = getConf();
    conf.db.connections = [{ id: 'fakeId', dialect: 123 }];
    return initManager(conf);
  }

  static async valConnectionsDialectMismatch() {
    const conf = getConf();
    conf.db.connections = [{ id: 'fakeId', dialect: 'test' }];
    return initManager(conf);
  }

  static async valConnectionsDialectImportExternal() {
    const conf = getConf();
    // just testing external module loading, no need for a real dialect module
    conf.db.dialects.external = '@hapi/code';
    conf.db.connections = [{ id: 'testId', dialect: 'external' }];
    return initManager(conf);
  }

  static async valConnectionsLogNone() {
    const conf = getConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = false;
    conf.db.connections[0].logError = false;
    return initManager(conf);
  }

  static async valConnectionsLogTags() {
    const conf = getConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = ['tag', 'test'];
    conf.db.connections[0].logError = ['tag', 'test', 'bad'];
    return initManager(conf);
  }

  static async valConnectionsLogTagsWithCustomLogger() {
    const conf = getConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = ['tag', 'test'];
    conf.db.connections[0].logError = ['tag', 'test', 'bad'];
    return initManager(conf, null, generateTestAbyssLogger);
  }

  static async valConnectionsIdDuplicate() {
    const conf = getConf();
    conf.db.connections.push(conf.db.connections[0]);
    return initManager(conf);
  }

  static async valNonexistentMainPath() {
    const conf = getConf();
    conf.mainPath = '/some/fake/path';
    return initManager(conf);
  }

  static async valNMainPath() {
    const conf = getConf();
    conf.mainPath = 'test/';
    return initManager(conf);
  }

  static async valNMainPathEmpty() {
    const conf = getConf();
    conf.mainPath = 'test/empty-db';
    conf.db.connections[0].driverOptions.numOfPreparedStmts = 0; // prevent statement count mismatch error
    return initManager(conf, null, null, null, true); // skip prepared function validation since they will be empty
  }

  static async valNPrivatePath() {
    const conf = getConf();
    conf.privatePath = 'test/';
    return initManager(conf);
  }

  static async valReinit() {
    const conf = getConf();
    await initManager(conf);
    return initManager(conf, null, null, priv.mgr);
  }

  static async valDebug() {
    const conf = getConf();
    conf.debug = true;
    return initManager(conf);
  }

  static async noCache() {
    const conf = getConf(), connName = conf.db.connections[0].name;
    await initManager(conf, null, generateTestConsoleLogger);

    try {
      await testRead(priv.mgr, connName);
    } catch (err) {
      priv.error = err;
      throw err;
    }
  }

  static async intervalCache() {
    const cacheOpts = { expiresIn: 100 };
    const conf = getConf(), connName = conf.db.connections[0].name;
    await initManager(conf, new IntervalCache(cacheOpts), priv.mgrLogit);

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
            "numOfPreparedStmts": 8,
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
 * @param {Function} [logger] A custom logger to use for the manager
 * @param {Manager} [mgr] The manager to initialize
 * @param {Boolean} [skipPrepFuncs] Truthy to skip {@link Manager~PreparedFunction} validation
 */
async function initManager(conf, cache, logger, mgr, skipPrepFuncs) {
  priv.cache = cache;
  priv.mgr = mgr || new Manager(conf, priv.cache, logger || false);
  await priv.mgr.init();
  
  priv.closeConnNames = conf.db.connections.map(conn => conn.name);

  const conn = conf.db.connections[0];
  const cname = conn.name;
  expect(priv.mgr.db, 'priv.mgr.db').to.be.object();
  expect(priv.mgr.db[cname], `priv.mgr.db.${cname}`).to.be.object();

  if (skipPrepFuncs) return;

  expect(priv.mgr.db[cname].read, `priv.mgr.db.${cname}.read`).to.be.object();
  expect(priv.mgr.db[cname].read.some, `priv.mgr.db.${cname}.read.some`).to.be.object();
  expect(priv.mgr.db[cname].read.some.tables, `priv.mgr.db.${cname}.read.some.tables`).to.be.function();

  expect(priv.mgr.db[cname].finance, `priv.mgr.db.${cname}.finance`).to.be.object();

  expect(priv.mgr.db[cname].finance.read, `priv.mgr.db.${cname}.finance.read`).to.be.object();
  expect(priv.mgr.db[cname].finance.read.annual, `priv.mgr.db.${cname}.finance.read.annual`).to.be.object();
  expect(priv.mgr.db[cname].finance.read.annual.report, `priv.mgr.db.${cname}.finance.read.annual.report`).to.be.function();

  expect(priv.mgr.db[cname].finance.create, `priv.mgr.db.${cname}.finance.create`).to.be.object();
  expect(priv.mgr.db[cname].finance.create.annual, `priv.mgr.db.${cname}.finance.create.annual`).to.be.object();
  expect(priv.mgr.db[cname].finance.create.annual.report, `priv.mgr.db.${cname}.finance.create.annual.report`).to.be.function();

  expect(priv.mgr.db[cname].finance.ap, `priv.mgr.db.${cname}.finance.ap`).to.be.object();

  expect(priv.mgr.db[cname].finance.ap.delete, `priv.mgr.db.${cname}.finance.ap.delete`).to.be.object();
  expect(priv.mgr.db[cname].finance.ap.delete.audits, `priv.mgr.db.${cname}.finance.ap.delete.audits`).to.be.function();

  expect(priv.mgr.db[cname].finance.ap.update, `priv.mgr.db.${cname}.finance.ap.update`).to.be.object();
  expect(priv.mgr.db[cname].finance.ap.update.audits, `priv.mgr.db.${cname}.finance.ap.update.audits`).to.be.function();

  expect(priv.mgr.db[cname].finance.ar, `priv.mgr.db.${cname}.finance.ar`).to.be.object();

  expect(priv.mgr.db[cname].finance.ar.delete, `priv.mgr.db.${cname}.finance.ar.delete`).to.be.object();
  expect(priv.mgr.db[cname].finance.ar.delete.audits, `priv.mgr.db.${cname}.finance.ar.delete.audits`).to.be.function();

  expect(priv.mgr.db[cname].finance.ar.update, `priv.mgr.db.${cname}.finance.ar.update`).to.be.object();
  expect(priv.mgr.db[cname].finance.ar.update.audits, `priv.mgr.db.${cname}.finance.ar.update.audits`).to.be.function();

  expect(priv.mgr.db[cname].no, `priv.mgr.db.${cname}.no`).to.be.object();
  expect(priv.mgr.db[cname].no.prefix, `priv.mgr.db.${cname}.no.prefix`).to.be.object();
  expect(priv.mgr.db[cname].no.prefix.some, `priv.mgr.db.${cname}.no.prefix.some`).to.be.object();
  expect(priv.mgr.db[cname].no.prefix.some.tables, `priv.mgr.db.${cname}.no.prefix.some.tables`).to.be.function();

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

  const opts = createExecOpts();
  const label = `READ mgr.db.${connName}.read.some.tables`;
  const labelWithoutPrefix = `READ mgr.db.${connName}.no.prefix.tables`;
  const optsNoPrefix = JSON.parse(JSON.stringify(opts));
  optsNoPrefix.type = 'READ';
  const performRead = async (label, length, noPrefix, opts, frags = ['test-frag']) => {
    let readRslt;
    if (noPrefix) readRslt = await mgr.db[connName].no.prefix.some.tables(opts, frags);
    else readRslt = await mgr.db[connName].read.some.tables(opts, frags);
    expect(readRslt, `${label} results`).to.be.array();
    expect(readRslt, `${label} results.length`).to.be.length(length);
    if (LOGGER.info) LOGGER.info(label, readRslt);
  };
  // two records should be returned w/o order by
  await performRead(`${label} BEFORE cache update:`, 2, false, opts);
  await performRead(`${labelWithoutPrefix} BEFORE cache update (w/o SQL file prefix for CRUD):`, 2, true, optsNoPrefix);
  
  // change the SQL file
  const sql = (await sqlFile()).toString(), sqlNoPrefix = (await sqlFile(null, true)).toString();
  try {
    // update the files to indicate that the result should contain a single record vs multiple
    await sqlFile(`${sql}${TestDialect.testSqlSingleRecordKey}`);
    await sqlFile(`${sqlNoPrefix}${TestDialect.testSqlSingleRecordKey}`, true);

    // wait for the the SQL statement to expire
    await Labrat.wait(cacheOpts && cacheOpts.hasOwnProperty('expiresIn') ? cacheOpts.expiresIn : 1000);

    // only when using a cache will the SQL be updated to reflect a single record
    const rslt2Cnt = cache ? 1 : 2;
    await performRead(`${label} AFTER ${cache ? '' : 'no-'}cache update:`, rslt2Cnt, false, opts);
    await performRead(`${labelWithoutPrefix} AFTER ${cache ? '' : 'no-'}cache update (w/o SQL file prefix for CRUD):`, rslt2Cnt, true, optsNoPrefix);

    // no commits, only reads
    await testOperation('pendingCommit', mgr, connName, 0, label);
    await testOperation('commit', mgr, connName, 0, label);
    // rollback test
    await testOperation('rollback', mgr, connName, 0, label);
  } finally {
    try {
      await sqlFile(sql);
    } finally {
      await sqlFile(sqlNoPrefix, true);
    }
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
    const tconf = getConnConf(conf, connName);
    autocommit = tconf.driverOptions && tconf.driverOptions.autocommit;
  }
  
  let pendCnt = 0;

  let fakeConnError, fakeConnLabel = `Connection "${connName}" (w/fake connection name)`;
  try {
    await testOperation('pendingCommit', mgr, 'fakeConnectionNameToTest', undefined, fakeConnLabel);
  } catch (err) {
    fakeConnError = err;
  }
  expect(fakeConnError, `ERROR ${fakeConnLabel}`).to.be.error();

  await testOperation('pendingCommit', mgr, 'fakeConnectionNameToTest', undefined, 'All connections (w/fake connection name)', null, true);
  await testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections', null, true);
  await testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/empty options)', {}, true);
  await testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/empty connections)', { connections: { } }, true);
  await testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/boolean connections name)', { connections: { [connName]: true } }, true);
  await testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/empty connections name)', { connections: { [connName]: { } } }, true);
  await testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/explicit parallel options)', { connections: { [connName]: { executeInSeries: false } } }, true);
  await testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/series execution)', { connections: { [connName]: { executeInSeries: true } } }, true);

  let cudRslt, label;

  cudRslt = await mgr.db[connName].finance.create.annual.report(xopts);
  label = `CREATE mgr.db.${connName}.finance.create.annual.report()`;
  expect(cudRslt, `${label} result`).to.be.undefined();
  await testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

  cudRslt = await mgr.db[connName].finance.read.annual.report(xopts);
  label = `READ mgr.db.${connName}.finance.read.annual.report()`;
  expect(cudRslt, `${label} result`).to.be.array();
  expect(cudRslt, `${label} result length`).to.be.length(2); // two records should be returned w/o order by
  await testOperation('pendingCommit', mgr, connName, pendCnt, label);
  
  cudRslt = await mgr.db[connName].finance.ap.update.audits(xopts);
  label = `UPDATE mgr.db.${connName}.finance.ap.update.audits()`;
  expect(cudRslt, `${label} result`).to.be.undefined();
  await testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

  cudRslt = await mgr.db[connName].finance.ap.delete.audits(xopts);
  label = `DELETE mgr.db.${connName}.finance.ap.delete.audits()`;
  expect(cudRslt, `${label} result`).to.be.undefined();
  await testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

  cudRslt = await mgr.db[connName].finance.ar.update.audits(xopts);
  label = `UPDATE mgr.db.${connName}.finance.ar.update.audits()`;
  expect(cudRslt, `${label} result`).to.be.undefined();
  await testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

  cudRslt = await mgr.db[connName].finance.ar.delete.audits(xopts);
  label = `DELETE mgr.db.${connName}.finance.ar.delete.audits()`;
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
 * @param {Manager~OperationOptions} [opts] The opearion options
 * @param {Boolean} [allConnections] Truthy to perform on all connections rather than just the passed connection
 * @returns {Object} The operation result
 */
async function testOperation(type, mgr, connName, expected, label, opts, allConnections) {
  const rslt = allConnections ? await mgr[type](opts) : await mgr[type](opts, connName);
  expect(rslt, `${label || 'DB'} ${type} result`).to.be.object();
  expect(rslt[connName], `${label || 'DB'} ${type} result`).to.equal(expected);
  return rslt;
} 

/**
 * Reads/writes test SQL file
 * @param {String} [sql] The SQL to write to the test file (omit to just read file)
 * @param {Boolean} [noPrefix] Truthy to use SQL file w/o prefix
 */
async function sqlFile(sql, noPrefix) {
  const sqlPath = `./test/db/${noPrefix ? 'no.prefix' : 'read'}.some.tables.sql`;
  if (typeof sql === 'string') {
    return Fs.promises.writeFile(sqlPath, sql);
  } else {
    return Fs.promises.readFile(sqlPath);
  }
}

/**
 * Generate a test console logger
 * @param {Sring[]} [tags] The tags that will prefix the log output
 */
function generateTestConsoleLogger(tags) {
  return function testConsoleLogger(o) {
    const logs = typeof o === 'string' ? [format.apply(null, arguments)] : arguments;
    const tagsLabel = `[${tags ? tags.join() : ''}]`;
    for (let i = 0, l = logs.length; i < l; ++i) {
      if (tags && tags.includes('error')) console.error(`${tagsLabel} ${logs[i]}`);
      else if (tags && tags.includes('warn')) console.warn(`${tagsLabel} ${logs[i]}`);
      else console.log(`${tagsLabel} ${logs[i]}`);
    }
  };
}

/**
 * Generate a test logger that just consumes logging
 * @param {Sring[]} [tags] The tags that will prefix the log output
 */
function generateTestAbyssLogger() {
  return function testAbyssLogger() {};
}

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}