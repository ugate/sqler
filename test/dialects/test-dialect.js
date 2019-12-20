'use strict';

const { Manager, Dialect } = require('../../index');
const { expect } = require('@hapi/code');

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
  async init(opts) {
    expect(opts, 'Options').to.be.object();
    //expect(opts.numOfPreparedStmts, `Number of prepared statements`).to.equal(7);
    return true;
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags) {
    expect(opts, 'opts').to.be.object();
    expect(opts.statementOptions, 'opts.statementOptions').to.be.object();
    expect(Manager.OPERATION_TYPES, 'opts.statementOptions.type').to.have.part.include(opts.statementOptions.type);
    expect(opts.bindVariables, 'opts.bindVariables').to.be.object();
    expect(opts.bindVariables, 'opts.bindVariables').to.contain({ someCol1: 1, someCol2: 2, someCol3: 3 });

    const isSingleRecord = sql.includes(TestDialect.testSqlSingleRecordKey);
    if (isSingleRecord) { // only test for frags when returning a single record
      expect(frags, 'frags').to.be.array();
      expect(frags[0], 'frags[0]').to.equal(TestDialect.testMultiRecordFragKey);
    }

    const cols = sql.match(/SELECT([\s\S]*?)FROM/i)[1].replace(/(\r\n|\n|\r)/gm, '').split(',');
    const rcrd = {};
    let ci = 0;
    for (let col of cols) {
      rcrd[col.substr(col.lastIndexOf('.') + 1)] = ++ci;
    }
    this.pending = this.pending || 0;
    if (opts.statementOptions.type !== 'READ') this.pending++;
    // simple test output when the 
    return isSingleRecord ? [rcrd] : [rcrd, rcrd];
  }

  /**
   * @inheritdoc
   */
  async commit() {
    return this.pending;
  }

  /**
   * @inheritdoc
   */
  async rollback() {
    return this.pending;
  }

  /**
   * @inheritdoc
   */
  async close() {
    return 1;
  }

  /**
   * @returns {String} a SQL segment indicating a test SQL should only return a single record
   */
  static get testSqlSingleRecordKey() {
    return 'ORDER BY';
  }

  /**
   * @returns {String} a SQL fragment that will be checked for when returning multiple records in a test
   */
  static get testMultiRecordFragKey() {
    return 'test-frag';
  }
}

module.exports = TestDialect;