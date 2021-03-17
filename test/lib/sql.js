'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const IntervalCache = require('../cache/interval-cache');
const UtilOpts = require('../util/utility-options');
const UtilSql = require('../util/utility-sql');
const Fs = require('fs');
const CACHE_READ_SQL_NAME = 'read.some.tables';
const CACHE_READ_SQL_PATH = './test/db/read.some.tables.sql';
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import * as IntervalCache from '../cache/interval-cache.mjs';
// TODO : import * as UtilOpts from '../util/utility-options.mjs';
// TODO : import * as UtilSql from '../util/utility-sql.mjs';

const test = { mgr: null, cache: null, mgrLogit: !!LOGGER.info };

// TODO : ESM uncomment the following line...
// export
class Tester {

  static async beforeEach() {
    const cch = test.cache;
    test.mgr = test.cache = null;
    if (cch && cch.start) await cch.start();
  }

  static async afterEach() {
    const mgr = test.mgr, cch = test.cache, error = test.error;
    test.mgr = test.cache = test.error = null;
    const proms = [];
    if (mgr && !error && test.closeConnNames) {
      for (let cname of test.closeConnNames) {
        proms.push(UtilSql.testOperation('close', mgr, cname, 1, `afterEach() connection "${cname}"`));
      }
    }
    if (cch && cch.stop) proms.push(cch.stop());
    return Promise.all(proms);
  }

  static async read() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    conf.db.connections[0].substitutes = UtilOpts.createSubstituteOpts();
    conf.db.connections[0].binds = UtilOpts.createConnectionBinds();
    await UtilSql.initManager(test, conf, {
      logger: test.mgrLogit ? UtilOpts.generateTestConsoleLogger : UtilOpts.generateTestAbyssLogger
    });

    const execOpts = UtilOpts.createExecOpts();
    execOpts.dateFormatter = (date) => date; // noop date formatter
    return UtilSql.testRead(test.mgr, connName, { execOpts });
  }

  static async readWithAddConnection() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    conf.db.connections[0].substitutes = UtilOpts.createSubstituteOpts();
    conf.db.connections[0].binds = UtilOpts.createConnectionBinds();
    const initOpts = {
      logger: test.mgrLogit ? UtilOpts.generateTestConsoleLogger : UtilOpts.generateTestAbyssLogger
    };
    await UtilSql.initManager(test, conf, initOpts);

    await UtilSql.testRead(test.mgr, connName);

    // create another configuration 
    const aconf = await UtilSql.initConf(), addConn = aconf.db.connections[0], oldAddConnId = addConn.id;
    addConn.name = `${addConn.name}ADD`;
    addConn.substitutes = UtilOpts.createSubstituteOpts();
    addConn.binds = UtilOpts.createConnectionBinds();

    // test using conf.univ.db[conn.id] private options
    await test.mgr.addConnection(addConn, null, test.cache, initOpts.logger);
    await UtilSql.testRead(test.mgr, addConn.name);

    // test using passed private options
    addConn.name = `${addConn.name}2`;
    await test.mgr.addConnection(addConn, aconf.univ.db[oldAddConnId], test.cache, initOpts.logger);
    return UtilSql.testRead(test.mgr, addConn.name);
  }

  static async readWithSetCacheThrow() {
    const cacheOpts = { expiresIn: 1 };
    const cache = new IntervalCache(cacheOpts);

    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    // missing cache should read SQL file on every execution
    await UtilSql.initManager(test, conf, { cache: null, logger: test.mgrLogit });
    await test.mgr.setCache(cache, false);

    const orig = await Fs.promises.readFile(CACHE_READ_SQL_PATH, 'utf-8');
    try {
      // no SQL content should fail (see test-dialect exec) 
      await Fs.promises.writeFile(CACHE_READ_SQL_PATH, '', 'utf-8');
      await UtilSql.testRead(test.mgr, connName, {
        cache,
        cacheOpts,
        prepFuncPaths: { read: CACHE_READ_SQL_NAME }
      });
    } catch (err) {
      if (err instanceof UtilOpts.TEST_DIALECT.NoSqlError) {
        throw err;
      } else {
        console.warn('Invalid error thrown for:', err);
      }
    } finally {
      try {
        await Fs.promises.writeFile(CACHE_READ_SQL_PATH, orig, 'utf-8');
      } catch (err) {
        console.error(error);
      }
      test.mgr.setCache(test.cache);
    }
  }

  static async readWithSetCache() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    // missing cache should read SQL file on every execution
    await UtilSql.initManager(test, conf, { cache: null, logger: test.mgrLogit ? UtilOpts.generateTestConsoleLogger : UtilOpts.generateTestAbyssLogger });

    const cacheOpts = { expiresIn: 100000 };
    const cache = new IntervalCache(cacheOpts);
    await test.mgr.setCache(cache, true);
    // also test setting the cache to itself - should be a noop
    await test.mgr.setCache(cache, true);

    const orig = await Fs.promises.readFile(CACHE_READ_SQL_PATH, 'utf-8');
    try {
      await Fs.promises.writeFile(CACHE_READ_SQL_PATH, '', 'utf-8');
      await UtilSql.testRead(test.mgr, connName, {
        cache,
        execOpts: UtilOpts.createExecOpts(),
        cacheOpts: {/* don't wait for cache to expire */},
        prepFuncPaths: { read: CACHE_READ_SQL_NAME }
      });
    } finally {
      try {
        await Fs.promises.writeFile(CACHE_READ_SQL_PATH, orig, 'utf-8');
      } catch (err) {
        console.error(error);
      }
      test.mgr.setCache(test.cache, true);
    }
  }

  static async readErrorReturn() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(test, conf, {
      logger: test.mgrLogit ? UtilOpts.generateTestConsoleLogger : UtilOpts.generateTestAbyssLogger
    });

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.throwExecError = true;
    execOpts.driverOptions.throwProperties = {
      testErrorProp: 123
    };
    let errorOpts = true;
    await UtilSql.testRead(test.mgr, connName, { execOpts, errorOpts });
    errorOpts = {
      returnErrors: true,
      includeBindValues: true
    };
    return UtilSql.testRead(test.mgr, connName, { execOpts, errorOpts });
  }

  static async readErrorThrow() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(test, conf);

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.throwExecError = true;
    return UtilSql.testRead(test.mgr, connName, { execOpts });
  }

  static async readWithSubstitutionsDialects() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(test, conf);

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.substitutes = { dialects: UtilOpts.createSubstituteDriverOptsDialects() };
    return UtilSql.testRead(test.mgr, connName, {
      execOpts,
      prepFuncPaths: { read: 'finance.read.annual.report' }
    });
  }

  static async readWithSubstitutionsFrags() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(test, conf);

    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.fragSqlSnippets = UtilOpts.createSubstituteDriverOptsFrags();
    let frags = [];
    for (let frag in conn.driverOptions.fragSqlSnippets) {
      frags.push(frag);
    }

    return UtilSql.testRead(test.mgr, connName, {
      frags,
      prepFuncPaths: { read: 'finance.read.annual.report' }
    });
  }

  static async readWithSubstitutionsVersionNegative1() {
    return UtilSql.testVersions(test, -1, [-1, 0, 3], 1, 2, 4);
  }

  static async readWithSubstitutionsVersion1() {
    return UtilSql.testVersions(test, 1, [0, 1, 4], -1, 2, 3);
  }

  static async readWithSubstitutionsVersion2() {
    return UtilSql.testVersions(test, 2, [2, 3, 4], -1, 0, 1);
  }

  static async execOptsAutoCommitFalseTransactionMissing() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(test, conf);

    const xopts = UtilOpts.createExecOpts();
    xopts.autoCommit = false;
    // no transaction started should throw error
    await UtilSql.testCUD(test.mgr, connName, conf, xopts, { noTransaction: true });
  }

  static async execOptsAutoCommitFalseTransactionIdMissing() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(test, conf);

    const xopts = UtilOpts.createExecOpts();
    xopts.autoCommit = false;
    // no transaction started should throw error
    await UtilSql.testCUD(test.mgr, connName, conf, xopts, { noTransactionId: true });
  }

  static async execOptsPreparedStatements() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(test, conf);

    const xopts = UtilOpts.createExecOpts();
    await UtilSql.testCUD(test.mgr, connName, conf, xopts, { prepare: true });
  }

  static async intervalCache() {
    const cacheOpts = { expiresIn: 100 };
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(test, conf, { cache: new IntervalCache(cacheOpts), logger: test.mgrLogit });

    try {
      await UtilSql.testRead(test.mgr, connName, { cache: test.cache, cacheOpts });

      const xopts = UtilOpts.createExecOpts();

      if (LOGGER.info) LOGGER.info('>> CUD tests using autoCommit = true (default)');
      xopts.autoCommit = true;
      await UtilSql.testCUD(test.mgr, connName, conf, xopts);

      if (LOGGER.info) LOGGER.info('>> CUD tests using autoCommit = false');
      xopts.autoCommit = false;
      await UtilSql.testCUD(test.mgr, connName, conf, xopts);
    } catch (err) {
      test.error = err;
      throw err;
    }
  }

  static async execOptsNone() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(test, conf);

    UtilOpts.TEST_DIALECT.BYPASS_NEXT_EXEC_OPTS_CHECK = true;
    return test.mgr.db[connName].read.no.binds();
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}