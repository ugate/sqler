'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('../../index');
const typedefs = require('../../typedefs');
const TestDialect = require('../dialects/test-dialect');
const UtilOpts = require('./utility-options');
const Fs = require('fs');
const Path = require('path');
const { expect } = require('@hapi/code');
const Stream = require('stream');
// node >= v16 :
// const { pipeline } = require('stream/promises');
// node < 16 :
const Util = require('util');
const pipeline = Util.promisify(Stream.pipeline);
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
   * @param {typedefs.SQLERCache} [initOpts.cache] The cache to use for the manager
   * @param {Function} [initOpts.logger] A custom logger to use for the manager
   * @param {Manager} [initOpts.mgr] The manager to initialize
   * @param {Boolean} [initOpts.skipPrepFuncs] Truthy to skip {@link typedefs.SQLERPreparedFunction} validation
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
    UtilSql.expectManagerDB(priv.mgr, cname, skipPrepFuncs);
  }

  /**
   * Validates `mgr.db[cname]`
   * @param {Manager} mgr The manager
   * @param {String} cname The connection name that will be validated
   * @param {Boolean} [skipPrepFuncs] Truthy to skip validation of the prepared functions
   */
  static expectManagerDB(mgr, cname, skipPrepFuncs) {
    expect(mgr.db, 'mgr.db').to.be.object();
    expect(mgr.db[cname], `mgr.db.${cname}`).to.be.object();

    if (skipPrepFuncs) return;

    expect(mgr.db[cname].read, `mgr.db.${cname}.read`).to.be.object();
    expect(mgr.db[cname].read.some, `mgr.db.${cname}.read.some`).to.be.object();
    expect(mgr.db[cname].read.some.tables, `mgr.db.${cname}.read.some.tables`).to.be.function();

    expect(mgr.db[cname].finance, `mgr.db.${cname}.finance`).to.be.object();

    expect(mgr.db[cname].finance.read, `mgr.db.${cname}.finance.read`).to.be.object();
    expect(mgr.db[cname].finance.read.annual, `mgr.db.${cname}.finance.read.annual`).to.be.object();
    expect(mgr.db[cname].finance.read.annual.report, `mgr.db.${cname}.finance.read.annual.report`).to.be.function();

    expect(mgr.db[cname].finance.create, `mgr.db.${cname}.finance.create`).to.be.object();
    expect(mgr.db[cname].finance.create.annual, `mgr.db.${cname}.finance.create.annual`).to.be.object();
    expect(mgr.db[cname].finance.create.annual.report, `mgr.db.${cname}.finance.create.annual.report`).to.be.function();

    expect(mgr.db[cname].finance.ap, `mgr.db.${cname}.finance.ap`).to.be.object();

    expect(mgr.db[cname].finance.ap.delete, `mgr.db.${cname}.finance.ap.delete`).to.be.object();
    expect(mgr.db[cname].finance.ap.delete.audits, `mgr.db.${cname}.finance.ap.delete.audits`).to.be.function();

    expect(mgr.db[cname].finance.ap.update, `mgr.db.${cname}.finance.ap.update`).to.be.object();
    expect(mgr.db[cname].finance.ap.update.audits, `mgr.db.${cname}.finance.ap.update.audits`).to.be.function();

    expect(mgr.db[cname].finance.ar, `mgr.db.${cname}.finance.ar`).to.be.object();

    expect(mgr.db[cname].finance.ar.delete, `mgr.db.${cname}.finance.ar.delete`).to.be.object();
    expect(mgr.db[cname].finance.ar.delete.audits, `mgr.db.${cname}.finance.ar.delete.audits`).to.be.function();

    expect(mgr.db[cname].finance.ar.update, `mgr.db.${cname}.finance.ar.update`).to.be.object();
    expect(mgr.db[cname].finance.ar.update.audits, `mgr.db.${cname}.finance.ar.update.audits`).to.be.function();

    expect(mgr.db[cname].no, `mgr.db.${cname}.no`).to.be.object();
    expect(mgr.db[cname].no.prefix, `mgr.db.${cname}.no.prefix`).to.be.object();
    expect(mgr.db[cname].no.prefix.some, `mgr.db.${cname}.no.prefix.some`).to.be.object();
    expect(mgr.db[cname].no.prefix.some.tables, `mgr.db.${cname}.no.prefix.some.tables`).to.be.function();
  }

  /**
   * Tests that `read` SQL statements work with and w/o {@link typedefs.SQLERCache} by re-writting the SQL file to see if the cahce picks it up
   * @param {Manager} mgr The {@link Manager} that will be used
   * @param {String} connName The connection name to use
   * @param {Object} [testReadOpts] Options specific to the test read
   * @param {typedefs.SQLERCache} [testReadOpts.cache] the {@link typedefs.SQLERCache} that will be used for SQL statements
   * @param {Object} [testReadOpts.cacheOpts] the options that were used on the specified {@link typedefs.SQLERCache}
   * @param {typedefs.SQLERConnectionOptions} [testReadOpts.connOpts] The {@link typedefs.SQLERConnectionOptions} that was used
   * @param {typedefs.SQLERExecOptions} [testReadOpts.execOpts] The {@link typedefs.SQLERExecOptions} to use (leave `undefined` to create)
   * @param {(typedefs.SQLERExecErrorOptions | Boolean)} [testReadOpts.errorOpts] Value passed into the {@link typedefs.SQLERPreparedFunction}
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
      /** @type {typedefs.SQLERExecResults} */
      let readRslt;
      /** @type {typedefs.SQLERPreparedFunction} */
      let pfunc;
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
        const throwPropOpt = UtilOpts.driverOpt('throwProperties', opts, connOpts);
        if (throwPropOpt.source && throwPropOpt.value) {
          for (let prop in throwPropOpt.value) {
            expect(readRslt.error.sqler[prop], `${label} result error.sqler.${prop}`).to.equal(throwPropOpt.value[prop]);
          }
        }
        if (errHandled) {
          expect(readRslt.error, `${label} result error = errorOpts.handler error`).to.equal(errCalled);
        }
      } else {
        const rcdCntOpt = UtilOpts.driverOpt('recordCount', opts, connOpts);
        const rcdCnt = (rcdCntOpt.source && rcdCntOpt.value) || 2;
        await UtilSql.expectResults(label, execOpts, Array.name, readRslt, Number.isInteger(opts.stream) && opts.stream >= 0 ? Stream.Readable.name : null, rcdCnt);
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
   * Tests for version substitutions using the `version` defined in the {@link typedefs.SQLERConnectionOptions}.
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
   * @param {typedefs.SQLERExecOptions} [xopts] The execution options
   * @param {Object} [testOpts={}] The test options
   * @param {Boolean} [testOpts.noTransaction] Truthy to skip `beginTransaction` (should throw an error)
   * @param {Boolean} [testOpts.noTransactionId] Truthy to set the `transaction.id` to null (should throw an error)
   */
  static async testCUD(mgr, connName, conf, xopts, testOpts = {}) {
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

    let tx, txLabel = `execOptions.autoCommit=${autoCommit}`;
    if (!autoCommit) {
      xopts = xopts || {};
      if (!testOpts.noTransaction || testOpts.noTransactionId) {
        txLabel = testOpts.noTransactionId ? `${txLabel}, transaction.id=null` : txLabel;
        txLabel = `Transaction object from await mgr.db.${connName}.beginTransaction() (${txLabel})`;
        tx = await mgr.db[connName].beginTransaction(testOpts.transactionOptions);
        xopts.transactionId = testOpts.noTransactionId ? null : tx.id;
      } else {
        txLabel = `No transaction (testOpts.noTransaction=${testOpts.noTransaction}, ${txLabel})`;
      }
    } else {
      txLabel = `No transaction (${txLabel})`;
    }
    if (!testOpts.noTransactionId) { // bypass transaction check when testing null tranasaction IDs (should throw in that case)
      UtilSql.expectTransaction(tx, autoCommit, txLabel);
    }
  
    const orignalName = xopts && xopts.name;
    const isStream = xopts && Number.isInteger(xopts.stream) && xopts.stream >= 0;

    label = `CREATE mgr.db.${connName}.finance.create.annual.report() [[${txLabel}]]`;
    if (!orignalName && xopts) xopts.name = label;
    rslt = await mgr.db[connName].finance.create.annual.report(xopts);
    await UtilSql.expectResults(label, xopts, isStream ? Array.name : undefined, rslt, isStream ? Stream.Writable.name : null, 1);
    UtilSql.expectPreparedStatement(rslt, !xopts.prepareStatement, label);
    await UtilSql.testOperation('state', mgr, connName, updateTestState(testState, autoCommit), label);

    label = `READ mgr.db.${connName}.finance.read.annual.report() [[${txLabel}]]`;
    if (!orignalName && xopts) xopts.name = label;
    rslt = await mgr.db[connName].finance.read.annual.report(xopts);
    await UtilSql.expectResults(label, xopts, Array.name, rslt, isStream ? Stream.Readable.name : null, 2); // two records should be returned w/o order by
    UtilSql.expectPreparedStatement(rslt, !xopts.prepareStatement, label);
    await UtilSql.testOperation('state', mgr, connName, updateTestState(testState, autoCommit), label);
    
    if (xopts.prepareStatement) await rslt.unprepare();

    label = `UPDATE mgr.db.${connName}.finance.ap.update.audits() [[${txLabel}]]`;
    if (!orignalName && xopts) xopts.name = label;
    rslt = await mgr.db[connName].finance.ap.update.audits(xopts);
    await UtilSql.expectResults(label, xopts, isStream ? Array.name : undefined, rslt, isStream ? Stream.Writable.name : null, 1);
    UtilSql.expectPreparedStatement(rslt, !xopts.prepareStatement, label);
    await UtilSql.testOperation('state', mgr, connName, updateTestState(testState, autoCommit), label);

    label = `DELETE mgr.db.${connName}.finance.ap.delete.audits() [[${txLabel}]]`;
    if (!orignalName && xopts) xopts.name = label;
    rslt = await mgr.db[connName].finance.ap.delete.audits(xopts);
    await UtilSql.expectResults(label, xopts, isStream ? Array.name : undefined, rslt, isStream ? Stream.Writable.name : null, 1);
    UtilSql.expectPreparedStatement(rslt, !xopts.prepareStatement, label);
    await UtilSql.testOperation('state', mgr, connName, updateTestState(testState, autoCommit), label);

    label = `UPDATE mgr.db.${connName}.finance.ar.update.audits() [[${txLabel}]]`;
    if (!orignalName && xopts) xopts.name = label;
    rslt = await mgr.db[connName].finance.ar.update.audits(xopts);
    await UtilSql.expectResults(label, xopts, isStream ? Array.name : undefined, rslt, isStream ? Stream.Writable.name : null, 1);
    UtilSql.expectPreparedStatement(rslt, !xopts.prepareStatement, label);
    await UtilSql.testOperation('state', mgr, connName, updateTestState(testState, autoCommit), label);

    label = `DELETE mgr.db.${connName}.finance.ar.delete.audits() [[${txLabel}]]`;
    if (!orignalName && xopts) xopts.name = label;
    rslt = await mgr.db[connName].finance.ar.delete.audits(xopts);
    await UtilSql.expectResults(label, xopts, isStream ? Array.name : undefined, rslt, isStream ? Stream.Writable.name : null, 1);
    UtilSql.expectPreparedStatement(rslt, !xopts.prepareStatement, label);
    await UtilSql.testOperation('state', mgr, connName, updateTestState(testState, autoCommit), label);

    if (!xopts) xopts.name = orignalName;

    if (!autoCommit) await tx.commit();
  }

  /**
   * Aserts that a CRUD opration results are as expected
   * @param {String} label An assertion label
   * @param {typedefs.SQLERExecOptions} xopts The execution options
   * @param {String} type The type to check for (e.g. `undefined`, `Array.name`, etc.)
   * @param {typedefs.SQLERExecResults} rslt
   * @param {String} [streamName] A stream type to assert (e.g. `Stream.Readable.name` or `Stream.Writable.name`)
   * @param {Integer} [length] The expected result row length
   */
  static async expectResults(label, xopts, type, rslt, streamName, length) {
    expect(rslt, `${label} result`).to.be.object();
    if (type === Array.length) {
      expect(rslt.rows, `${label} result rows`).to.be.array();
    } else if (type === undefined) {
      expect(rslt.rows, `${label} result rows`).to.be.undefined();
    }
    if (streamName === Stream.Readable.name) {
      // const readsFromStreamAC = new AbortController();
      // readsFromStreamAC.signal.onabort = () => {
      //   throw new Error(`${label} result read stream rows aborted!`);
      // };
      // setTimeout(() => readsFromStreamAC.abort(), 60000);
      expect(rslt.rows, `${label} result read stream rows`).to.be.array();
      const readsFromStream = [];
      for (let readStream of rslt.rows) {
        expect(readStream,`${label} result read stream row`).to.be.instanceof(Stream.Readable);
        for await (const chunk of readStream) {
          readsFromStream.push(chunk);
        }
      }
      if (length !== undefined) {
        expect(readsFromStream, `${label} result read stream rows.length`).to.be.length(length);
      } else {
        expect(readsFromStream, `${label} result read stream rows not empty`).to.not.be.empty();
      }
    } else if (streamName === Stream.Writable.name) {
      let batches;
      expect(rslt.rows, `${label} result write stream rows`).to.be.array();
      for (let writeStream of rslt.rows) {
        expect(writeStream,`${label} result write stream row`).to.be.instanceof(Stream.Writable);
        // test-dialect simply supplies the original binds during event emissions
        writeStream.on(typedefs.EVENT_STREAM_WRITTEN_BATCH, (batch) => {
          const streamLabel = `${label} result "${typedefs.EVENT_STREAM_WRITTEN_BATCH}" batch event`;
          expect(batch, streamLabel).to.be.array();
          expect(batch, `${streamLabel} length`).to.be.length(xopts.stream || 1);
          for (let binds of batch) {
            expect(binds, `${streamLabel} binds`).to.equal(xopts.binds, { deepFunction: true });
          }
          batches = batches ? [ ...batches, ...batch ] : [ ...batch ];
        });
        await pipeline(Stream.Readable.from(async function* reads() {
          // for (let i = 0; i < rslt.rows.length; i++) {
            yield xopts.binds;
          // }
        }()), writeStream);
      }
      if (length !== undefined) {
        expect(batches, `${label} result streamed batches.length`).to.be.length(length);
      } else {
        expect(batches, `${label} result streamed batches not empty`).to.not.be.empty();
      }
    } else if (type !== undefined && length !== undefined) {
      expect(rslt.rows, `${label} result rows.length`).to.be.length(length);
    }
  }

  /**
   * Expects a transaction (or `undefined` when not a transaction)
   * @param {typedefs.SQLERTransaction} tx The results from a {@link typedefs.SQLERPreparedFunction} for a CUD invocation
   * @param {Boolean} [notExpected] Flag indicating the transaction should __NOT__ be expected
   * @param {String} [label] The label to use for the expect
   */
  static expectTransaction(tx, notExpected, label = '') {
    if (notExpected) {
      expect(tx, `${label} transaction`).to.be.undefined();
    } else {
      expect(tx, `${label} transaction`).to.not.be.undefined();
      expect(tx, `${label} transaction`).to.be.object();
      expect(tx.id, `${label} transaction.id`).to.be.string();
      expect(tx.id, `${label} transaction.id`).to.not.be.empty();
      expect(tx.commit,`${label} transaction.commit`).to.be.function();
      expect(tx.rollback,`${label} transaction.rollback`).to.be.function();
    }
  }

  /**
   * Expects a prepared statement (or `undefined` when not a prepared statement)
   * @param {typedefs.SQLERExecResults} rslt The results from a {@link typedefs.SQLERPreparedFunction} for a CUD invocation
   * @param {Boolean} [notExpected] Flag indicating the transaction should __NOT__ be expected
   * @param {String} [label] The label to use for the expect
   */
  static expectPreparedStatement(rslt, notExpected, label = '') {
    if (notExpected) {
      expect(rslt.unprepare,`${label} result unprepare`).to.be.undefined();
    } else {
      expect(rslt.unprepare,`${label} result unprepare`).to.be.function();
    }
  }

  /**
   * Tests if the specified operation and operation result
   * @param {String} type The type of manager operation to test (e.g. `close`, etc.)
   * @param {(Manager | Object)} opd Either the {@link Manager} or a {@link typedefs.SQLERExecResults}
   * @param {String} connName The connection name to use
   * @param {*} expected The expected result
   * @param {String} [label] A label to use for the operation
   * @param {typedefs.SQLEROperationOptions} [opts] The opearion options
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
      conn.driverOptions.numOfPreparedFuncs = conn.driverOptions.sqlPaths.length;
    }
    return conf;
  }
}

/**
 * Updates the test state (when needed)
 * @private
 * @param {Object} state The test state to determine if it needs to be updated
 * @param {Boolean} autoCommit Truthy to indicate the test should be auto-committed
 * @returns {Object} The passed state
 */
function updateTestState(state, autoCommit) {
  return autoCommit ? state : ++state.pending && state;
}

// TODO : ESM comment the following line...
module.exports = UtilSql;