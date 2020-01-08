'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('../../index');
const TestDialect = require('../dialects/test-dialect');
const UtilOpts = require('./utility-options');
const Fs = require('fs');
const { expect } = require('@hapi/code');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from '../../index.mjs';
// TODO : import * as TestDialect from '../dialects/test-dialect.mjs';
// TODO : import * as UtilOpts from './utility-options.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import { expect } from '@hapi/code';

// TODO : ESM uncomment the following line...
// export
class UtilSql {

  /**
   * Sets a generated manager using the specified cache and validates the test SQL functions are generated
   * @param {Object} priv The private storage
   * @param {Object} conf The manager configuration
   * @param {Object} [initOpts] The initialization options
   * @param {Cache} [initOpts.cache] The cache to use for the manager
   * @param {Function} [initOpts.logger] A custom logger to use for the manager
   * @param {Manager} [initOpts.mgr] The manager to initialize
   * @param {Boolean} [initOpts.skipPrepFuncs] Truthy to skip {@link Manager~PreparedFunction} validation
   */
  static async initManager(priv, conf, initOpts = {}) {
    const { cache, logger, mgr, skipPrepFuncs } = initOpts;
    priv.cache = cache;
    priv.mgr = mgr || new Manager(conf, priv.cache, logger || false);
    await priv.mgr.init();

    if (!conf) return; // should throw error in manager
    
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
  static async testRead(mgr, connName, cache, cacheOpts) {
    if (LOGGER.info) LOGGER.info(`Begin basic test`);

    const opts = UtilOpts.createExecOpts();
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
    const sql = (await UtilSql.sqlFile()).toString(), sqlNoPrefix = (await UtilSql.sqlFile(null, true)).toString();
    try {
      // update the files to indicate that the result should contain a single record vs multiple
      await UtilSql.sqlFile(`${sql}${TestDialect.testSqlSingleRecordKey}`);
      await UtilSql.sqlFile(`${sqlNoPrefix}${TestDialect.testSqlSingleRecordKey}`, true);

      // wait for the the SQL statement to expire
      await Labrat.wait(cacheOpts && cacheOpts.hasOwnProperty('expiresIn') ? cacheOpts.expiresIn : 1000);

      // only when using a cache will the SQL be updated to reflect a single record
      const rslt2Cnt = cache ? 1 : 2;
      await performRead(`${label} AFTER ${cache ? '' : 'no-'}cache update:`, rslt2Cnt, false, opts);
      await performRead(`${labelWithoutPrefix} AFTER ${cache ? '' : 'no-'}cache update (w/o SQL file prefix for CRUD):`, rslt2Cnt, true, optsNoPrefix);

      // no commits, only reads
      await UtilSql.testOperation('pendingCommit', mgr, connName, 0, label);
      await UtilSql.testOperation('commit', mgr, connName, 0, label);
      // rollback test
      await UtilSql.testOperation('rollback', mgr, connName, 0, label);
    } finally {
      try {
        await UtilSql.sqlFile(sql);
      } finally {
        await UtilSql.sqlFile(sqlNoPrefix, true);
      }
    }
  }

  /**
   * Tests create, update, delete
   * @param {Manager} mgr The manager
   * @param {String} connName The connection name to use
   * @param {Object} conf The {@link UtilOpts.getConf} object
   * @param {Manager~ExecOptions} xopts The execution options
   * @returns {Integer} The number of pending commits
   */
  static async testCUD(mgr, connName, conf, xopts) {
    let autocommit = xopts && xopts.driverOptions && xopts.driverOptions.autocommit;
    if (!xopts || !xopts.driverOptions || !xopts.driverOptions.hasOwnProperty('autocommit')) {
      const tconf = UtilOpts.getConnConf(conf, connName);
      autocommit = tconf.driverOptions && tconf.driverOptions.autocommit;
    }
    
    let pendCnt = 0;

    let fakeConnError, fakeConnLabel = `Connection "${connName}" (w/fake connection name)`;
    try {
      await UtilSql.testOperation('pendingCommit', mgr, 'fakeConnectionNameToTest', undefined, fakeConnLabel);
    } catch (err) {
      fakeConnError = err;
    }
    expect(fakeConnError, `ERROR ${fakeConnLabel}`).to.be.error();

    await UtilSql.testOperation('pendingCommit', mgr, 'fakeConnectionNameToTest', undefined, 'All connections (w/fake connection name)', null, true);
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections', null, true);
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/empty options)', {}, true);
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/empty connections)', { connections: { } }, true);
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/boolean connections name)', { connections: { [connName]: true } }, true);
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/empty connections name)', { connections: { [connName]: { } } }, true);
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/explicit parallel options)', { connections: { [connName]: { executeInSeries: false } } }, true);
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, 'All connections (w/series execution)', { connections: { [connName]: { executeInSeries: true } } }, true);

    let cudRslt, label;

    cudRslt = await mgr.db[connName].finance.create.annual.report(xopts);
    label = `CREATE mgr.db.${connName}.finance.create.annual.report()`;
    expect(cudRslt, `${label} result`).to.be.undefined();
    await UtilSql.testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

    cudRslt = await mgr.db[connName].finance.read.annual.report(xopts);
    label = `READ mgr.db.${connName}.finance.read.annual.report()`;
    expect(cudRslt, `${label} result`).to.be.array();
    expect(cudRslt, `${label} result length`).to.be.length(2); // two records should be returned w/o order by
    await UtilSql.testOperation('pendingCommit', mgr, connName, pendCnt, label);
    
    cudRslt = await mgr.db[connName].finance.ap.update.audits(xopts);
    label = `UPDATE mgr.db.${connName}.finance.ap.update.audits()`;
    expect(cudRslt, `${label} result`).to.be.undefined();
    await UtilSql.testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

    cudRslt = await mgr.db[connName].finance.ap.delete.audits(xopts);
    label = `DELETE mgr.db.${connName}.finance.ap.delete.audits()`;
    expect(cudRslt, `${label} result`).to.be.undefined();
    await UtilSql.testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

    cudRslt = await mgr.db[connName].finance.ar.update.audits(xopts);
    label = `UPDATE mgr.db.${connName}.finance.ar.update.audits()`;
    expect(cudRslt, `${label} result`).to.be.undefined();
    await UtilSql.testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

    cudRslt = await mgr.db[connName].finance.ar.delete.audits(xopts);
    label = `DELETE mgr.db.${connName}.finance.ar.delete.audits()`;
    expect(cudRslt, `${label} result`).to.be.undefined();
    await UtilSql.testOperation('pendingCommit', mgr, connName, autocommit ? pendCnt : ++pendCnt, label);

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
  static async testOperation(type, mgr, connName, expected, label, opts, allConnections) {
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
  static async sqlFile(sql, noPrefix) {
    const sqlPath = `./test/db/${noPrefix ? 'no.prefix' : 'read'}.some.tables.sql`;
    if (typeof sql === 'string') {
      return Fs.promises.writeFile(sqlPath, sql);
    } else {
      return Fs.promises.readFile(sqlPath);
    }
  }
}

// TODO : ESM comment the following line...
module.exports = UtilSql;