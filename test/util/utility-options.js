'use strict';

// TODO : ESM comment the following lines...
const { format } = require('util');
// TODO : import { format } from 'util';

const TEST_DATE = new Date();

// TODO : ESM uncomment the following line...
// export
class UtilOpts {

  static get TEST_DIALECT() {
    return require('../dialects/test-dialect');
  }

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
              "numOfPreparedFuncs": 0,
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
    return { someCol1: 1, someCol2: 2, someCol3: 3, someCol4: 4, someColDate: TEST_DATE };
  }

  /**
   * @returns {Object} The test `substitutions` for {@link typedefs.SQLERConnectionOptions}
   */
  static createSubstituteOpts() {
    // for testing purposes, the key should not be contained in the value (e.g. { SOME_OTHER_DB: 'SOME_OTHER_DB_TEST' })
    return { SOME_OTHER_DB: 'SOME_OTHER_TEST_DB' };
  }

  /**
   * @returns {Object} The test driver options to handle substitutions for dialects
   */
  static createSubstituteDriverOptsDialects() {
    return {
      present: ['DIALECT_SUB_TEST_COL'],
      absent: ['DIALECT_SUB_REMOVE_ME_COL']
    };
  }

  /**
   * @param {(Number | Number[])} presentVersion One or more versions that should be present in the SQL being executed
   * @param {(Number | Number[])} absentVersion The version that should __not__ be present in the SQL being executed
   * @returns {Object} The test driver options to handle substitutions for versioning
   */
  static createSubstituteDriverOptsVersions(presentVersion, absentVersion) {
    const rtn = {
      present: [],
      absent: []
    };
    const pvers = Array.isArray(presentVersion) ? presentVersion : [presentVersion];
    for (let pver of pvers) {
      rtn.present.push(`VERSION_SUB_TEST_COL1 = ${pver}`);
    }
    const avers = Array.isArray(absentVersion) ? absentVersion : [absentVersion];
    for (let aver of avers) {
      rtn.absent.push(`VERSION_SUB_TEST_COL1 = ${aver}`);
    }
    return rtn;
  }

  /**
   * @returns {Object} An object with each property name as the fragment key and the value as the expected clause to be found in the executed SQL statement
   */
  static createSubstituteDriverOptsFrags() {
    return {
      myFragKey: 'FRAG_SUB_TEST_COL IS NOT NULL'
    };
  }

  /**
   * Extracts a connection configuration by name in a specified configuration
   * @param {Object} conf The {@link UtilOpts.getConf} object
   * @param {String} name The connection name to find
   * @returns {Object} The connection configuration object that matches the specified name
   */
  static extractConnConf(conf, name) {
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

  /**
   * Checks if a specified driver option is present and returns the value when present
   * @param {String} opt The option to check for
   * @param {typedefs.SQLERExecOptions} execOpts The execution options being passed
   * @param {typedefs.SQLERConnectionOptions} connConf The connection configuration being used
   * @returns {Object} The driver option details that contain the following properties:
   * - `source` - _execution_ when the option came from the {@link typedefs.SQLERExecOptions}, _connection_ when coming from the {@link typedefs.SQLERConnectionOptions}
   * or _undefined_ when the option is not found.
   * - `value` - The option value
   */
  static driverOpt(opt, execOpts, connConf) {
    if (execOpts && execOpts.driverOptions && execOpts.driverOptions.hasOwnProperty(opt)) {
      return { source: 'execution', value: execOpts.driverOptions[opt] };
    } else if (connConf && connConf.driverOptions && connConf.driverOptions.hasOwnProperty(opt)) {
      return { source: 'connection', value: connConf.driverOptions[opt] };
    }
    return {};
  }
}

// TODO : ESM comment the following line...
module.exports = UtilOpts;