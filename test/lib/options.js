'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const UtilOpts = require('../util/utility-options');
const UtilSql = require('../util/utility-sql');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import * as Utilopts from '../util/utility-options.mjs';
// TODO : import * as UtilSql from '../util/utility-sql.mjs';

const test = { mgr: null, cache: null, mgrLogit: !!LOGGER.info };

// TODO : ESM uncomment the following line...
// export
class Tester {

  static async valConfMissing() {
    return UtilSql.initManager(test);
  }

  static async valUnivNull() {
    const conf = await UtilSql.initConf();
    conf.univ = null;
    return UtilSql.initManager(test, conf);
  }

  static async valUnivDbNull() {
    const conf = await UtilSql.initConf();
    conf.univ.db = null;
    return UtilSql.initManager(test, conf);
  }

  static async valUnivDbEmpty() {
    const conf = await UtilSql.initConf();
    conf.univ.db = {};
    return UtilSql.initManager(test, conf);
  }

  static async valHostNull() {
    const conf = await UtilSql.initConf();
    conf.univ.db.testId.host = null;
    return UtilSql.initManager(test, conf);
  }

  static async valDbNull() {
    const conf = await UtilSql.initConf();
    conf.db = null;
    await UtilSql.initManager(test, conf);
  }

  static async valDialectsNull() {
    const conf = await UtilSql.initConf();
    conf.db.dialects = null;
    await UtilSql.initManager(test, conf);

    conf = await UtilSql.initConf();
    conf.db.dialects = {};
    return UtilSql.initManager(test, conf);
  }

  static async valDialectsEmpty() {
    const conf = await UtilSql.initConf();
    conf.db.dialects = {};
    await UtilSql.initManager(test, conf);
  }

  static async valLoggers() {
    const conf = await UtilSql.initConf();
    await UtilSql.initManager(test, conf, { logger: false });
    return UtilSql.initManager(test, conf, { logger: UtilOpts.generateTestAbyssLogger });
  }

  static async valConnectionsNull() {
    const conf = await UtilSql.initConf();
    conf.db.connections = null;
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsEmpty() {
    const conf = await UtilSql.initConf();
    conf.db.connections = [];
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsIdMissing() {
    const conf = await UtilSql.initConf();
    delete conf.db.connections[0].id;
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsNameMissing() {
    const conf = await UtilSql.initConf();
    delete conf.db.connections[0].name;
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsDirMissing() {
    const conf = await UtilSql.initConf();
    conf.db.connections[0].name = conf.db.connections[0].dir;
    delete conf.db.connections[0].dir;
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsDialectMissing() {
    const conf = await UtilSql.initConf();
    conf.db.connections = [{ id: 'fakeId' }];
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsDialectinvalid() {
    const conf = await UtilSql.initConf();
    conf.db.connections = [{ id: 'fakeId', dialect: 123 }];
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsDialectMismatch() {
    const conf = await UtilSql.initConf();
    conf.db.connections = [{ id: 'fakeId', dialect: 'test' }];
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsDialectImportExternal() {
    const conf = await UtilSql.initConf();
    // just testing external module loading, no need for a real dialect module
    conf.db.dialects.external = '@hapi/code';
    conf.db.connections = [{ id: 'testId', dialect: 'external' }];
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsLogNone() {
    const conf = await UtilSql.initConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = false;
    conf.db.connections[0].logError = false;
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsLogTags() {
    const conf = await UtilSql.initConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = ['tag', 'test'];
    conf.db.connections[0].logError = ['tag', 'test', 'bad'];
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsLogTagsWithCustomLogger() {
    const conf = await UtilSql.initConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = ['tag', 'test'];
    conf.db.connections[0].logError = ['tag', 'test', 'bad'];
    return UtilSql.initManager(test, conf, { logger: UtilOpts.generateTestAbyssLogger });
  }

  static async valConnectionsIdDuplicate() {
    const conf = await UtilSql.initConf();
    conf.db.connections.push(conf.db.connections[0]);
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsSubstitutes() {
    const conf = await UtilSql.initConf();
    conf.db.connections[0].substitutes = UtilOpts.createSubstituteOpts();
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsBinds() {
    const conf = await UtilSql.initConf();
    conf.db.connections[0].binds = UtilOpts.createConnectionBinds();
    return UtilSql.initManager(test, conf);
  }

  static async valConnectionsDriverOptionsMissing() {
    const conf = await UtilSql.initConf();
    delete conf.db.connections[0].driverOptions;
    return UtilSql.initManager(test, conf);
  }

  static async valNonexistentMainPath() {
    const conf = await UtilSql.initConf('/some/fake/path');
    return UtilSql.initManager(test, conf);
  }

  static async valMainPathEmpty() {
    const conf = await UtilSql.initConf('test/empty-db');
    conf.db.connections[0].driverOptions.numOfPreparedFuncs = 0; // prevent statement count mismatch error
    return UtilSql.initManager(test, conf, { skipPrepFuncs: true }); // skip prepared function validation since they will be empty
  }

  static async valPrivatePath() {
    const conf = await UtilSql.initConf();
    conf.privatePath = 'test/';
    return UtilSql.initManager(test, conf);
  }

  static async valInitErrorReturn() {
    const conf = await UtilSql.initConf(), conn = conf.db.connections[0];
    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.throwInitError = true;
    return UtilSql.initManager(test, conf, { returnErrors: true });
  }

  static async valReinit() {
    const conf = await UtilSql.initConf();
    await UtilSql.initManager(test, conf);
    return UtilSql.initManager(test, conf, { mgr: test.mgr });
  }

  static async valDebug() {
    const conf = await UtilSql.initConf();
    conf.debug = true;
    return UtilSql.initManager(test, conf);
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}