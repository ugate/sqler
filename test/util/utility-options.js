'use strict';

// TODO : ESM comment the following lines...
const { format } = require('util');
// TODO : import { format } from 'util';

// TODO : ESM uncomment the following line...
// export
class UtilOpts {

  static getConf(mainPath) {
    const conf = {
      "mainPath": mainPath || 'test',
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
              "numOfPreparedStmts": 0,
              "autocommit": false,
              "throwExecError": false
            }
          }
        ]
      }
    };
    return conf;
  }

  /**
   * @param {Boolean} [exclExpansion] Truthy to exclude expansion `binds` 
   * @returns {Object} The test execution options to pass into {@link Manager.execute}
   */
  static createExecOpts(exclExpansion) {
    const xopts = { binds: { someCol1: 1, someCol2: 2, someCol3: 3 } };
    if (!exclExpansion) xopts.binds.expanedCol = [1, 2, 3];
    return xopts;
  }

  /**
   * @returns {Object} The test execution options to pass into {@link Manager.execute}
   */
  static createConnectionBinds() {
    return { someCol1: 1, someCol2: 2, someCol3: 3, someCol4: 4 };
  }

  /**
   * @returns {Object} The test `substitutions` for {@link Manager~ConnectionOptions}
   */
  static createSubstituteOpts() {
    // for testing purposes, the key should not be contained in the value (e.g. { SOME_OTHER_DB: 'SOME_OTHER_DB_TEST' })
    return { SOME_OTHER_DB: 'SOME_OTHER_TEST_DB' };
  }

  /**
   * @returns {Object} The test driver options to handle substitutions
   */
  static createSubstituteDriverOpts() {
    return {
      dialect: {
        present: ['DIALECT_SUB_TEST_COL'],
        absent: ['DIALECT_SUB_REMOVE_ME_COL']
      }
    };
  }
  /**
   * Gets a connection by name in a specified configuration
   * @param {Object} conf The {@link UtilOpts.getConf} object
   * @param {String} name The connection name to find
   * @returns {Object} The connection configuration object that matches the specified name
   */
  static getConnConf(conf, name) {
    for (let conn of conf.db.connections) {
      if (conn.name === name) return conn;
    }
  }

  /**
   * Generate a test console logger
   * @param {Sring[]} [tags] The tags that will prefix the log output
   */
  static generateTestConsoleLogger(tags) {
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
  static generateTestAbyssLogger() {
    return function testAbyssLogger() {};
  }
}

// TODO : ESM comment the following line...
module.exports = UtilOpts;