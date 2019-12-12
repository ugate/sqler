'use strict';

const { Dialect } = require('../../index');

/**
 * Static test {@link Dialect} implementation
 */
class TestDialect extends Dialect {

  /**
   * @inheritdoc
   */
  constructor(username, password, sqlConf, name, type, privatePath, track, errorLogger, logger, debug) {
    super(username, password, sqlConf, name, type, privatePath, track, errorLogger, logger, debug);
  }

  /**
   * @inheritdoc
   */
  async init() {
    return Promise.resolve(true);
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags) {
    let key = TestDialect.testSqlSingleRecordKey;
    const cols = sql.match(/SELECT([\s\S]*?)FROM/i)[1].replace(/(\r\n|\n|\r)/gm, '').split(',');
    const rcrd = {};
    let ci = 0;
    for (let col of cols) {
      rcrd[col.substr(col.lastIndexOf('.') + 1)] = ++ci;
    }
    // simple test output when the 
    if (sql.includes(key)) return Promise.resolve([rcrd]);
    return Promise.resolve([rcrd, rcrd]);
  }

  /**
   * @inheritdoc
   */
  async close() {
    Promise.resolve();
  }

  /**
   * @returns {String} a SQL segment indicating a test SQL should only return a single record
   */
  static get testSqlSingleRecordKey() {
    return 'ORDER BY';
  }
}

module.exports = TestDialect;