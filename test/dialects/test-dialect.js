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
    if (sql.includes('ORDER BY')) return Promise.resolve([{ prop1: 1, prop2: 2 }]);
    return Promise.resolve([{ prop1: 1, prop2: 2 }, { prop1: 3, prop2: 4 }]);
  }
}

module.exports = TestDialect;