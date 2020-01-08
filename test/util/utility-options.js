'use strict';

// TODO : ESM comment the following lines...
const { format } = require('util');
// TODO : import { format } from 'util';

// TODO : ESM uncomment the following line...
// export
class UtilOpts {

  static getConf() {
    const conf = {
      "mainPath": 'test',
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
              "numOfPreparedStmts": 8,
              "autocommit": false
            }
          }
        ]
      }
    };
    return conf;
  }

  /**
   * @returns {Object} The test execution options to pass into {@link Manager.execute}
   */
  static createExecOpts() {
    return { binds: { someCol1: 1, someCol2: 2, someCol3: 3 } };
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