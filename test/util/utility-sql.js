'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('../../index');
const TestDialect = require('../dialects/test-dialect');
const UtilOpts = require('./utility-options');
const Fs = require('fs');
const Path = require('path');
const { expect } = require('@hapi/code');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from '../../index.mjs';
// TODO : import * as TestDialect from '../dialects/test-dialect.mjs';
// TODO : import * as UtilOpts from './utility-options.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import * as Path from 'path';
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
   * @param {Boolean} [initOpts.returnErrors] Override value passed into {@link Manager.init}
   */
  static async initManager(priv, conf, initOpts = {}) {
    const { cache, logger, mgr, skipPrepFuncs } = initOpts;
    priv.cache = cache;
    priv.mgr = mgr || new Manager(conf, priv.cache, logger || false);

    if (!conf) return; // should throw error in manager
    
    priv.closeConnNames = conf.db.connections.map(conn => conn.name);

    const conn = conf.db.connections[0];
    const cname = conn.name;

    const initRtnsErrors = initOpts.hasOwnProperty('returnErrors');
    const initThrowsErrors = initOpts.returnErrors && conn.driverOptions && conn.driverOptions.throwInitError;
    const initRslts = initRtnsErrors ? await priv.mgr.init(initOpts.returnErrors) : await priv.mgr.init();

    expect(initRslts, 'manager.init()').to.be.object();
    expect(initRslts.result, 'manager.init() results').to.be.object();
    if (initThrowsErrors) {
      expect(initRslts.errors, 'manager.init() errors').to.be.array();
      expect(initRslts.errors, 'manager.init() errors length = conf.db.connections.length').to.have.length(conf.db.connections.length);
      for (let err of initRslts.errors) {
        expect(err, 'manager.init() error').to.be.error();
      }
    } else {
      let name;
      for (let iname in initRslts.result) {
        if (initRslts.result.hasOwnProperty(iname)) continue;
        name = null;
        for (let cconn of conf.db.connections) {
          if (cconn.name === iname) {
            name = cconn.name;
            break;
          }
        }
        expect(iname, `manager.init() result.${iname} = conf.db.connections[].name`).to.equal(name);
      }
    }

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
   * @param {Object} [testReadOpts] Options specific to the test read
   * @param {Cache} [testReadOpts.cache] the {@link Cache} that will be used for SQL statements
   * @param {Object} [testReadOpts.cacheOpts] the options that were used on the specified {@link Cache}
   * @param {Manager~ConnectionOptions} [testReadOpts.connOpts] The {@link Manager~ConnectionOptions} that was used
   * @param {Manager~ExecOptions} [testReadOpts.execOpts] The {@link Manager~ExecOptions} to use (leave `undefined` to create)
   * @param {(Manager~ExecErrorOptions | Boolean)} [testReadOpts.errorOpts] Value passed into the {@link Manager~PreparedFunction}
   * @param {Object} [testReadOpts.prepFuncPaths] Override the path(s) to the prepared function that resides on the {@link Manager}
   * @param {String} [testReadOpts.prepFuncPaths.read='read.some.tables'] Override path from the `mgr.db[connName]` to the prepared function that will be executed for a file
   * that is prefixed with `read`
   * @param {String} [testReadOpts.prepFuncPaths.readNoPrefix='no.prefix.tables'] Override path from the `mgr.db[connName]` to the prepared function that will be executed for
   * a file that is __not__ prefixed with `read`
   * @param {String[]} [testReadOpts.frags] The framents to send to the prepared function
   * @returns {(Error | undefined)} An error when the test fails
   */
  static async testRead(mgr, connName, testReadOpts) {
    if (LOGGER.info) LOGGER.info(`Begin basic test`);

    testReadOpts = testReadOpts || {};
    const { cache, cacheOpts, connOpts, execOpts, errorOpts, frags, prepFuncPaths = { read: 'read.some.tables', readNoPrefix: 'no.prefix.some.tables' } } = testReadOpts;
    const opts = typeof execOpts === 'undefined' ? UtilOpts.createExecOpts() : execOpts;
    const label = `READ mgr.db.${connName}.${prepFuncPaths.read}`;
    const labelWithoutPrefix = `READ mgr.db.${connName}.${prepFuncPaths.readNoPrefix}`;
    const optsNoPrefix = prepFuncPaths.readNoPrefix ? JSON.parse(JSON.stringify(opts || {})) : null;
    if (optsNoPrefix) optsNoPrefix.type = 'READ';
    const performRead = async (label, noPrefix, opts, frags) => {
      let readRslt, pfunc;
      const pths = noPrefix ? prepFuncPaths.readNoPrefix.split('.') : prepFuncPaths.read.split('.');
      for (let ppth of pths) {
        if (pfunc) pfunc = pfunc[ppth];
        else pfunc = mgr.db[connName][ppth];
      }
      expect(pfunc, noPrefix ? labelWithoutPrefix : label).to.be.function();
      let errHandled, errCalled;
      if (errorOpts && errorOpts.returnErrors && !errorOpts.handler) {
        errHandled = true;
        errorOpts.handler = err => {
          errCalled = err;
        };
      }
      if (noPrefix) readRslt = await pfunc(opts, frags, errorOpts);
      else readRslt = await pfunc(opts, frags, errorOpts);
      const throwOpt = UtilOpts.driverOpt('throwExecError', opts, connOpts);
      expect(readRslt, `${label} result`).to.be.object();
      if ((errorOpts === true || (errorOpts && errorOpts.returnErrors)) && throwOpt.source && throwOpt.value) {
        expect(readRslt.error, `${label} result error`).to.be.error();
        expect(readRslt.error.sqler, `${label} result error.sqler`).to.be.object();
        if (errHandled) {
          expect(readRslt.error, `${label} result error = errorOpts.handler error`).to.equal(errCalled);
        }
      } else {
        const rcdCntOpt = UtilOpts.driverOpt('recordCount', opts, connOpts);
        expect(readRslt.rows, `${label} result rows`).to.be.array();
        expect(readRslt.rows, `${label} result rows.length`).to.be.length((rcdCntOpt.source && rcdCntOpt.value) || 2);
      }
      if (LOGGER.info) LOGGER.info(label, readRslt);
    };
    // two records should be returned w/o order by

    await performRead(`${label} BEFORE cache update:`, false, opts, frags);
    if (prepFuncPaths.readNoPrefix) {
      await performRead(`${labelWithoutPrefix} BEFORE cache update (w/o SQL file prefix for CRUD):`, true, optsNoPrefix, frags);
    }
    
    // change the SQL file
    const sql = (await UtilSql.sqlFile()).toString(), sqlNoPrefix = (await UtilSql.sqlFile(null, true)).toString();
    try {
      // set the single record key on the driver options so that the test dialect can determine how many records to return (when the SQL contains the key)
      opts.driverOptions = opts.driverOptions || {};
      const singleRecordKey = '\nORDER BY *';
      opts.driverOptions.singleRecordKey = singleRecordKey;
      
      // update the files to indicate that the result should contain a single record vs multiple (chen cache expiry is being used)
      await UtilSql.sqlFile(`${sql}${singleRecordKey}`);
      if (prepFuncPaths.readNoPrefix) {
        await UtilSql.sqlFile(`${sqlNoPrefix}${singleRecordKey}`, true);
      }

      // wait for the the SQL statement to expire
      await Labrat.wait(cacheOpts && cacheOpts.hasOwnProperty('expiresIn') ? cacheOpts.expiresIn : 1000);

      // only when using a cache will the SQL be updated to reflect a single record
      const origRcdCnt = opts.driverOptions.recordCount;
      opts.driverOptions.recordCount = cache ? 1 : 2;
      await performRead(`${label} AFTER ${cache ? '' : 'no-'}cache update:`, false, opts, frags);
      if (prepFuncPaths.readNoPrefix) {
        await performRead(`${labelWithoutPrefix} AFTER ${cache ? '' : 'no-'}cache update (w/o SQL file prefix for CRUD):`, true, optsNoPrefix, frags);
      }

      // set opts back to original value
      opts.driverOptions.recordCount = origRcdCnt;

      // no commits, only reads
      await UtilSql.testOperation('state', mgr, connName, { pending: 0 }, label);
    } finally {
      try {
        await UtilSql.sqlFile(sql);
      } finally {
        if (prepFuncPaths.readNoPrefix) await UtilSql.sqlFile(sqlNoPrefix, true);
      }
    }
  }

  /**
   * Tests for version substitutions using the `version` defined in the {@link Manager~ConnectionOptions}.
   * @param {Object} priv The private dataspace
   * @param {Manager} priv.mgr The {@link Manager} to use
   * @param {Number} version The version that will be set on the connection options
   * @param {(Number | Number[])} presentVersion The version that should be present in the executing SQL statement
   * @param {...Number} absentVersion The version that should __not__ be present in the executing SQL statement
   * @returns {(Error | undefined)} The result from {@link #testRead}
   */
  static async testVersions(priv, version, presentVersion, ...absentVersion) {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;

    conn.version = version;

    await UtilSql.initManager(priv, conf);

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.versions = UtilOpts.createSubstituteDriverOptsVersions(presentVersion, absentVersion);
    const testOpts = {
      execOpts,
      prepFuncPaths: { read: 'finance.read.annual.report' }
    };
    return UtilSql.testRead(priv.mgr, connName, testOpts);
  }

  /**
   * Tests create, update, delete
   * @param {Manager} mgr The manager
   * @param {String} connName The connection name to use
   * @param {Object} conf The {@link UtilOpts.getConf} object
   * @param {Manager~ExecOptions} xopts The execution options
   * @param {Boolean} noTransaction Truthy to skip `beginTransaction` (should throw an error)
   */
  static async testCUD(mgr, connName, conf, xopts, noTransaction) {
    const testState = { pending: 0 };
    const autoCommit = xopts && xopts.hasOwnProperty('autoCommit') ? xopts.autoCommit : true;

    let fakeConnError, fakeConnLabel = `Connection "${connName}" (w/fake connection name)`;
    try {
      await UtilSql.testOperation('state', mgr, 'fakeConnectionNameToTest', undefined, fakeConnLabel);
    } catch (err) {
      fakeConnError = err;
    }
    expect(fakeConnError, `ERROR ${fakeConnLabel}`).to.be.error();

    await UtilSql.testOperation('state', mgr, 'fakeConnectionNameToTest', undefined, 'All connections (w/fake connection name)', null, true);
    await UtilSql.testOperation('state', mgr, connName, testState, 'All connections', null, true);
    await UtilSql.testOperation('state', mgr, connName, testState, 'All connections (w/empty options)', {}, true);
    await UtilSql.testOperation('state', mgr, connName, testState, 'All connections (w/empty connections)', { connections: { } }, true);
    await UtilSql.testOperation('state', mgr, connName, testState, 'All connections (w/boolean connections name)', { connections: { [connName]: true } }, true);
    await UtilSql.testOperation('state', mgr, connName, testState, 'All connections (w/empty connections name)', { connections: { [connName]: { } } }, true);
    await UtilSql.testOperation('state', mgr, connName, testState, 'All connections (w/explicit parallel options)', { connections: { [connName]: { executeInSeries: false } } }, true);
    await UtilSql.testOperation('state', mgr, connName, testState, 'All connections (w/series execution)', { connections: { [connName]: { executeInSeries: true } } }, true);

    let rslt, label;

    if (!autoCommit) {
      xopts = xopts || {};
      if (!noTransaction) {
        xopts.transactionId = await mgr.db[connName].beginTransaction();
        expect(xopts.transactionId, 'xopts.transactionId').to.be.string();
        expect(xopts.transactionId, 'xopts.transactionId').to.not.be.empty();
      }
    }

    rslt = await mgr.db[connName].finance.create.annual.report(xopts);
    label = `CREATE mgr.db.${connName}.finance.create.annual.report()`;
    expect(rslt, `${label} result`).to.be.object();
    expect(rslt.rows, `${label} result rows`).to.be.undefined();
    UtilSql.expectTransaction(rslt, autoCommit, label);
    await UtilSql.testOperation('state', mgr, connName, autoCommit ? testState : ++testState.pending && testState, label);

    rslt = await mgr.db[connName].finance.read.annual.report(xopts);
    label = `READ mgr.db.${connName}.finance.read.annual.report()`;
    expect(rslt, `${label} result`).to.be.object();
    expect(rslt.rows, `${label} result rows`).to.be.array();
    expect(rslt.rows, `${label} result rows.length`).to.be.length(2); // two records should be returned w/o order by
    UtilSql.expectTransaction(rslt, autoCommit, label);
    await UtilSql.testOperation('state', mgr, connName, testState, label);
    
    rslt = await mgr.db[connName].finance.ap.update.audits(xopts);
    label = `UPDATE mgr.db.${connName}.finance.ap.update.audits()`;
    expect(rslt, `${label} result`).to.be.object();
    expect(rslt.rows, `${label} result rows`).to.be.undefined();
    UtilSql.expectTransaction(rslt, autoCommit, label);
    await UtilSql.testOperation('state', mgr, connName, autoCommit ? testState : ++testState.pending && testState, label);

    rslt = await mgr.db[connName].finance.ap.delete.audits(xopts);
    label = `DELETE mgr.db.${connName}.finance.ap.delete.audits()`;
    expect(rslt, `${label} result`).to.be.object();
    expect(rslt.rows, `${label} result rows`).to.be.undefined();
    UtilSql.expectTransaction(rslt, autoCommit, label);
    await UtilSql.testOperation('state', mgr, connName, autoCommit ? testState : ++testState.pending && testState, label);

    rslt = await mgr.db[connName].finance.ar.update.audits(xopts);
    label = `UPDATE mgr.db.${connName}.finance.ar.update.audits()`;
    expect(rslt, `${label} result`).to.be.object();
    expect(rslt.rows, `${label} result rows`).to.be.undefined();
    UtilSql.expectTransaction(rslt, autoCommit, label);
    await UtilSql.testOperation('state', mgr, connName, autoCommit ? testState : ++testState.pending && testState, label);

    rslt = await mgr.db[connName].finance.ar.delete.audits(xopts);
    label = `DELETE mgr.db.${connName}.finance.ar.delete.audits()`;
    expect(rslt, `${label} result`).to.be.object();
    expect(rslt.rows, `${label} result rows`).to.be.undefined();
    UtilSql.expectTransaction(rslt, autoCommit, label);
    await UtilSql.testOperation('state', mgr, connName, autoCommit ? testState : ++testState.pending && testState, label);

    if (!autoCommit) await rslt.commit();
  }

  /**
   * Expects a transaction (or `undefined` when not a transaction)
   * @param {Manager~ExecResults} rslt The results from a {@link Manager~PreparedFunction} for a CUD invocation
   * @param {Boolean} notExpected Flag indicating the transaction should __NOT__ be expected
   * @param {String} [label] The label to use for the expect
   */
  static expectTransaction(rslt, notExpected, label = '') {
    if (notExpected) {
      expect(rslt.commit,`${label} result commit`).to.be.undefined();
      expect(rslt.rollback,`${label} result rollback`).to.be.undefined();
    } else {
      expect(rslt.commit,`${label} result commit`).to.be.function();
      expect(rslt.rollback,`${label} result rollback`).to.be.function();
    }
  }

  /**
   * Tests if the specified operation and operation result
   * @param {String} type The type of manager operation to test (e.g. `close`, etc.)
   * @param {(Manager | Object)} opd Either the {@link Manager} or a {@link Manager~ExecResults}
   * @param {String} connName The connection name to use
   * @param {*} expected The expected result
   * @param {String} [label] A label to use for the operation
   * @param {Manager~OperationOptions} [opts] The opearion options
   * @param {Boolean} [allConnections] Truthy to perform on all connections rather than just the passed connection
   * @returns {Object} The operation result
   */
  static async testOperation(type, opd, connName, expected, label, opts, allConnections) {
    const forMgr = opd instanceof Manager;
    const rslt = !forMgr || allConnections ? await opd[type](opts) : await opd[type](opts, connName);
    expect(rslt, `${label || 'DB'} ${type} returned`).to.be.object();
    expect(rslt.result, `${label || 'DB'} ${type} result`).to.be.object();
    
    if (typeof expected === 'object') {
      expect(rslt.result[connName], `${label || 'DB'} ${type} result.${connName}`).to.be.object();
      for (let exp in expected) {
        if (!expected.hasOwnProperty(exp)) continue;
        expect(rslt.result[connName][exp], `${label || 'DB'} ${type} result.${connName}.${exp}`).to.equal(expected[exp]);
      }
    } else {
      expect(rslt.result[connName], `${label || 'DB'} ${type} result.${connName}`).to.equal(expected);
    }

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

  /**
   * Scans a directory and any subdirectories for SQL files and adds their paths to the provided list
   * @param {String[]} paths Where the SQL file paths will be stored
   * @param {String} pdir The directory to scan for SQL files
   */
  static async sqlFilePaths(paths, pdir) {
    let pth, proms = [];
    const reads = await Fs.promises.readdir(pdir);
    for (let ri = 0, stat; ri < reads.length; ++ri) {
      pth = Path.resolve(pdir, reads[ri]);
      stat = await Fs.promises.stat(pth);
      if (stat && stat.isDirectory()) {
        proms.push(UtilSql.sqlFilePaths(paths, pth));
        continue;
      }
      if (!reads[ri].endsWith('.sql')) continue;
      paths.push(pth);
    }
    return Promise.all(proms);
  }

  static async initConf(mainPath) {
    const conf = UtilOpts.getConf(mainPath);
    const basePath = Path.resolve(conf.mainPath || './test/db');
    for (let conn of conf.db.connections) {
      conn.driverOptions = conn.driverOptions || {};
      conn.driverOptions.sqlPaths = [];
      await UtilSql.sqlFilePaths(conn.driverOptions.sqlPaths, Path.join(basePath, conn.dir || conn.name));
      conn.driverOptions.numOfPreparedStmts = conn.driverOptions.sqlPaths.length;
    }
    return conf;
  }
}

// TODO : ESM comment the following line...
module.exports = UtilSql;