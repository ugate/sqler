'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const UtilOpts = require('../util/utility-options');
const UtilSql = require('../util/utility-sql');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import * as Utilopts from '../util/utility-options.mjs';
// TODO : import * as UtilSql from '../util/utility-sql.mjs';

const priv = { mgr: null, cache: null, mgrLogit: !!LOGGER.info };

// TODO : ESM uncomment the following line...
// export
class Tester {

  static async valConfMissing() {
    return UtilSql.initManager(priv);
  }

  static async valUnivNull() {
    const conf = UtilOpts.getConf();
    conf.univ = null;
    return UtilSql.initManager(priv, conf);
  }

  static async valUnivDbNull() {
    const conf = UtilOpts.getConf();
    conf.univ.db = null;
    return UtilSql.initManager(priv, conf);
  }

  static async valUnivDbEmpty() {
    const conf = UtilOpts.getConf();
    conf.univ.db = {};
    return UtilSql.initManager(priv, conf);
  }

  static async valHostNull() {
    const conf = UtilOpts.getConf();
    conf.univ.db.testId.host = null;
    return UtilSql.initManager(priv, conf);
  }

  static async valDbNull() {
    const conf = UtilOpts.getConf();
    conf.db = null;
    await UtilSql.initManager(priv, conf);
  }

  static async valDialectsNull() {
    const conf = UtilOpts.getConf();
    conf.db.dialects = null;
    await UtilSql.initManager(priv, conf);

    conf = UtilOpts.getConf();
    conf.db.dialects = {};
    return UtilSql.initManager(priv, conf);
  }

  static async valDialectsEmpty() {
    const conf = UtilOpts.getConf();
    conf.db.dialects = {};
    await UtilSql.initManager(priv, conf);
  }

  static async valLoggers() {
    const conf = UtilOpts.getConf();
    await UtilSql.initManager(priv, conf, { logger: false });
    return UtilSql.initManager(priv, conf, { logger: UtilOpts.generateTestAbyssLogger });
  }

  static async valConnectionsNull() {
    const conf = UtilOpts.getConf();
    conf.db.connections = null;
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsEmpty() {
    const conf = UtilOpts.getConf();
    conf.db.connections = [];
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsIdMissing() {
    const conf = UtilOpts.getConf();
    delete conf.db.connections[0].id;
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsNameMissing() {
    const conf = UtilOpts.getConf();
    delete conf.db.connections[0].name;
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsDirMissing() {
    const conf = UtilOpts.getConf();
    conf.db.connections[0].name = conf.db.connections[0].dir;
    delete conf.db.connections[0].dir;
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsDialectMissing() {
    const conf = UtilOpts.getConf();
    conf.db.connections = [{ id: 'fakeId' }];
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsDialectinvalid() {
    const conf = UtilOpts.getConf();
    conf.db.connections = [{ id: 'fakeId', dialect: 123 }];
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsDialectMismatch() {
    const conf = UtilOpts.getConf();
    conf.db.connections = [{ id: 'fakeId', dialect: 'test' }];
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsDialectImportExternal() {
    const conf = UtilOpts.getConf();
    // just testing external module loading, no need for a real dialect module
    conf.db.dialects.external = '@hapi/code';
    conf.db.connections = [{ id: 'testId', dialect: 'external' }];
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsLogNone() {
    const conf = UtilOpts.getConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = false;
    conf.db.connections[0].logError = false;
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsLogTags() {
    const conf = UtilOpts.getConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = ['tag', 'test'];
    conf.db.connections[0].logError = ['tag', 'test', 'bad'];
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsLogTagsWithCustomLogger() {
    const conf = UtilOpts.getConf();
    conf.db.connections[0].version = '3.3.3';
    conf.db.connections[0].log = ['tag', 'test'];
    conf.db.connections[0].logError = ['tag', 'test', 'bad'];
    return UtilSql.initManager(priv, conf, { logger: UtilOpts.generateTestAbyssLogger });
  }

  static async valConnectionsIdDuplicate() {
    const conf = UtilOpts.getConf();
    conf.db.connections.push(conf.db.connections[0]);
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsSubstitutes() {
    const conf = UtilOpts.getConf();
    conf.db.connections[0].substitutes = UtilOpts.createSubstituteOpts();
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsBinds() {
    const conf = UtilOpts.getConf();
    conf.db.connections[0].binds = UtilOpts.createConnectionBinds();
    return UtilSql.initManager(priv, conf);
  }

  static async valConnectionsDriverOptionsMissing() {
    const conf = UtilOpts.getConf();
    delete conf.db.connections[0].driverOptions;
    return UtilSql.initManager(priv, conf);
  }

  static async valNonexistentMainPath() {
    const conf = UtilOpts.getConf();
    conf.mainPath = '/some/fake/path';
    return UtilSql.initManager(priv, conf);
  }

  static async valNMainPath() {
    const conf = UtilOpts.getConf();
    conf.mainPath = 'test/';
    return UtilSql.initManager(priv, conf);
  }

  static async valNMainPathEmpty() {
    const conf = UtilOpts.getConf();
    conf.mainPath = 'test/empty-db';
    conf.db.connections[0].driverOptions.numOfPreparedStmts = 0; // prevent statement count mismatch error
    return UtilSql.initManager(priv, conf, { skipPrepFuncs: true }); // skip prepared function validation since they will be empty
  }

  static async valNPrivatePath() {
    const conf = UtilOpts.getConf();
    conf.privatePath = 'test/';
    return UtilSql.initManager(priv, conf);
  }

  static async valReinit() {
    const conf = UtilOpts.getConf();
    await UtilSql.initManager(priv, conf);
    return UtilSql.initManager(priv, conf, { mgr: priv.mgr });
  }

  static async valDebug() {
    const conf = UtilOpts.getConf();
    conf.debug = true;
    return UtilSql.initManager(priv, conf);
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}