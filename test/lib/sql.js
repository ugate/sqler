'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const IntervalCache = require('../cache/interval-cache');
const UtilOpts = require('../util/utility-options');
const UtilSql = require('../util/utility-sql');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import * as IntervalCache from '../cache/interval-cache.mjs';
// TODO : import * as UtilOpts from '../util/utility-options.mjs';
// TODO : import * as UtilSql from '../util/utility-sql.mjs';

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
    await UtilSql.initManager(priv, conf, {
      logger: priv.mgrLogit ? UtilOpts.generateTestConsoleLogger : UtilOpts.generateTestAbyssLogger
    });

    return UtilSql.testRead(priv.mgr, connName);
  }

  static async readErrorReturn() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(priv, conf, {
      logger: priv.mgrLogit ? UtilOpts.generateTestConsoleLogger : UtilOpts.generateTestAbyssLogger
    });

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.throwExecError = true;
    execOpts.driverOptions.throwProperties = {
      testErrorProp: 123
    };
    let errorOpts = true;
    await UtilSql.testRead(priv.mgr, connName, { execOpts, errorOpts });
    errorOpts = {
      returnErrors: true,
      includeBindValues: true
    };
    return UtilSql.testRead(priv.mgr, connName, { execOpts, errorOpts });
  }

  static async readErrorThrow() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(priv, conf);

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.throwExecError = true;
    return UtilSql.testRead(priv.mgr, connName, { execOpts });
  }

  static async readWithSubstitutionsDialects() {
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(priv, conf);

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.substitutes = { dialects: UtilOpts.createSubstituteDriverOptsDialects() };
    return UtilSql.testRead(priv.mgr, connName, {
      execOpts,
      prepFuncPaths: { read: 'finance.read.annual.report' }
    });
  }

  static async readWithSubstitutionsFrags() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(priv, conf);

    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.fragSqlSnippets = UtilOpts.createSubstituteDriverOptsFrags();
    let frags = [];
    for (let frag in conn.driverOptions.fragSqlSnippets) {
      frags.push(frag);
    }

    return UtilSql.testRead(priv.mgr, connName, {
      frags,
      prepFuncPaths: { read: 'finance.read.annual.report' }
    });
  }

  static async readWithSubstitutionsVersionNegative1() {
    return UtilSql.testVersions(priv, -1, [-1, 0, 3], 1, 2, 4);
  }

  static async readWithSubstitutionsVersion1() {
    return UtilSql.testVersions(priv, 1, [0, 1, 4], -1, 2, 3);
  }

  static async readWithSubstitutionsVersion2() {
    return UtilSql.testVersions(priv, 2, [2, 3, 4], -1, 0, 1);
  }

  static async execOptsAutoCommitFalseTransactionIdMissing() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(priv, conf);

    const xopts = UtilOpts.createExecOpts();
    xopts.autoCommit = false;
    // no transaction started should throw error
    await UtilSql.testCUD(priv.mgr, connName, conf, xopts, { noTransaction: true });
  }

  static async execOptsPreparedStatements() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(priv, conf);

    const xopts = UtilOpts.createExecOpts();
    await UtilSql.testCUD(priv.mgr, connName, conf, xopts, { prepare: true });
  }

  static async intervalCache() {
    const cacheOpts = { expiresIn: 100 };
    const conf = await UtilSql.initConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(priv, conf, { cache: new IntervalCache(cacheOpts), logger: priv.mgrLogit });

    try {
      await UtilSql.testRead(priv.mgr, connName, { cache: priv.cache, cacheOpts });

      const xopts = UtilOpts.createExecOpts();

      if (LOGGER.info) LOGGER.info('>> CUD tests using autoCommit = true (default)');
      xopts.autoCommit = true;
      await UtilSql.testCUD(priv.mgr, connName, conf, xopts);

      if (LOGGER.info) LOGGER.info('>> CUD tests using autoCommit = false');
      xopts.autoCommit = false;
      await UtilSql.testCUD(priv.mgr, connName, conf, xopts);
    } catch (err) {
      priv.error = err;
      throw err;
    }
  }

  static async execOptsNone() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0], connName = conn.name;
    await UtilSql.initManager(priv, conf);

    UtilOpts.TEST_DIALECT.BYPASS_NEXT_EXEC_OPTS_CHECK = true;
    return priv.mgr.db[connName].read.no.binds();
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}