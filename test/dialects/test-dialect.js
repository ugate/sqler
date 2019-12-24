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
    this.testPending = 0;
  }

  /**
   * @inheritdoc
   */
  async init(opts) {
    expect(opts, 'opts').to.be.object();
    expect(opts.numOfPreparedStmts, `Number of prepared statements`).to.equal(7);
    return true;
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags) {
    expectOpts(this, opts, true);
    expect(opts.binds, 'opts.binds').to.be.object();
    expect(opts.binds, 'opts.binds').to.contain({ someCol1: 1, someCol2: 2, someCol3: 3 });

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
    // simple test output when the 
    return isSingleRecord ? [rcrd] : [rcrd, rcrd];
  }

  /**
   * @inheritdoc
   */
  async commit(opts) {
    expectOpts(this, opts);
    return this.testPending = 0;
  }

  /**
   * @inheritdoc
   */
  async rollback(opts) {
    expectOpts(this, opts);
    return this.testPending = 0;
  }

  /**
   * @inheritdoc
   */
  async close(opts) {
    expectOpts(this, opts);
    this.testPending = 0;
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

/**
 * Expects options
 * @param {TestDialect} dialect The dialect instance being tested
 * @param {(DialectOptions | ExecOptions)} opts The expected options
 * @param {Boolean} isExec Flag indicating if the options are coming from {@link Dialect.exec}
 */
function expectOpts(dialect, opts, isExec) {
  expect(opts, 'opts').to.be.object();

  if (isExec) {
    expect(Manager.OPERATION_TYPES, 'opts.type').to.have.part.include(opts.type);
    dialect.testPending += opts.type === 'READ' ? 0 : 1;
  }

  expect(opts.tx, 'opts.tx').to.be.object();
  expect(opts.tx.pending, 'opts.tx.pending').to.equal(dialect.testPending);
}

module.exports = TestDialect;