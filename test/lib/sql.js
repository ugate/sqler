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

  static async noCache() {
    const conf = UtilOpts.getConf(), connName = conf.db.connections[0].name;
    conf.db.connections[0].substitutes = UtilOpts.createSubstituteOpts();
    conf.db.connections[0].binds = UtilOpts.createConnectionBinds();
    await UtilSql.initManager(priv, conf, { logger: UtilOpts.generateTestConsoleLogger });

    try {
      await UtilSql.testRead(priv.mgr, connName);
    } catch (err) {
      priv.error = err;
      throw err;
    }
  }

  static async readErrorReturn() {
    const conf = UtilOpts.getConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(priv, conf);

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.throwExecError = true;
    return UtilSql.testRead(priv.mgr, connName, { execOpts, returnErrors: true });
  }

  static async readErrorThrow() {
    const conf = UtilOpts.getConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(priv, conf);

    const execOpts = UtilOpts.createExecOpts();
    execOpts.driverOptions = execOpts.driverOptions || {};
    execOpts.driverOptions.throwExecError = true;
    return UtilSql.testRead(priv.mgr, connName, { execOpts });
  }

  static async intervalCache() {
    const cacheOpts = { expiresIn: 100 };
    const conf = UtilOpts.getConf(), connName = conf.db.connections[0].name;
    await UtilSql.initManager(priv, conf, { cache: new IntervalCache(cacheOpts), logger: priv.mgrLogit });

    try {
      await UtilSql.testRead(priv.mgr, connName, { cache: priv.cache, cacheOpts });

      let xopts = UtilOpts.createExecOpts(), pendingCount;
      pendingCount = await UtilSql.testCUD(priv.mgr, connName, conf, xopts);
      await UtilSql.testOperation('commit', priv.mgr, connName, pendingCount);

      if (LOGGER.info) LOGGER.info('>> CUD tests using autocommit = true');
      xopts.driverOptions = { autocommit: true };
      pendingCount = await UtilSql.testCUD(priv.mgr, connName, conf, xopts);
    } catch (err) {
      priv.error = err;
      throw err;
    }
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}