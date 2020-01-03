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
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    super(priv, connConf, track, errorLogger, logger, debug);
    this.testPending = 0;

    expect(priv, 'priv').to.be.object();
    expect(priv.host, 'priv.host').to.be.string();
    expect(priv.host, 'priv.host.length').to.not.be.empty();
    expect(priv.username, 'priv.username').to.be.string();
    expect(priv.username, 'priv.username.length').to.not.be.empty();
    expect(priv.password, 'priv.password').to.be.string();
    expect(priv.password, 'priv.password.length').to.not.be.empty();

    expect(connConf, 'connConf').to.be.object();
    expect(connConf.id, 'connConf.id').to.be.string();
    expect(connConf.id, 'connConf.id.length').to.not.be.empty();
    expect(connConf.name, 'connConf.name').to.be.string();
    expect(connConf.name, 'connConf.name.length').to.not.be.empty();
    expect(connConf.dir, 'connConf.dir').to.be.string();
    expect(connConf.dir, 'connConf.dir.length').to.not.be.empty();
    expect(connConf.service, 'connConf.service').to.be.string();
    expect(connConf.service, 'connConf.service.length').to.not.be.empty();
    expect(connConf.dialect, 'connConf.dialect').to.be.string();
    expect(connConf.dialect, 'connConf.dialect.length').to.not.be.empty();

    expect(connConf.driverOptions, 'connConf.driverOptions').to.be.object();
    expect(connConf.driverOptions.numOfPreparedStmts, 'connConf.driverOptions.numOfPreparedStmts').to.be.number();
    expect(connConf.driverOptions.autocommit, 'connConf.driverOptions.autocommit').to.be.boolean();

    expect(track, 'track').to.be.object();
    expect(errorLogger, 'errorLogger').to.be.function();
    expect(logger, 'logger').to.be.function();
    expect(debug, 'debug').to.be.boolean();
  }

  /**
   * @inheritdoc
   */
  async init(opts) {
    expect(opts, 'opts').to.be.object();
    expect(opts.numOfPreparedStmts, `Number of prepared statements`).to.equal(this.connConf.driverOptions && this.connConf.driverOptions.numOfPreparedStmts);
    return true;
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags) {
    expectOpts(this, opts, 'exec');
    expect(opts.binds, 'opts.binds').to.be.object();
    expect(opts.binds, 'opts.binds').to.contain({ someCol1: 1, someCol2: 2, someCol3: 3 });

    if (frags) {
      expect(frags, 'frags').to.be.array();
      expect(frags, 'frags.length').to.not.be.empty();
      for (let frag of frags) {
        expect(frag, 'frag (iteration)').to.be.string();
        expect(frag, 'frag (iteration) length').to.not.be.empty();
      }
    }

    const isSingleRecord = sql.includes(TestDialect.testSqlSingleRecordKey);
    if (isSingleRecord) { // only test for frags when returning a single record
      expect(frags, 'frags').to.be.array();
      expect(frags[0], 'frags[0]').to.equal(TestDialect.testMultiRecordFragKey);
    }

    let cols = sql.match(/SELECT([\s\S]*?)FROM/i);
    if (!cols) return;
    cols = cols[1].replace(/(\r\n|\n|\r)/gm, '').split(',');
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
    expectOpts(this, opts, 'commit');
    const committed = this.testPending;
    this.testPending = 0;
    return committed;
  }

  /**
   * @inheritdoc
   */
  async rollback(opts) {
    expectOpts(this, opts, 'rollback');
    return this.testPending = 0;
  }

  /**
   * @inheritdoc
   */
  async close(opts) {
    expectOpts(this, opts, 'close');
    this.testPending = 0;
    return 1;
  }

  /**
   * @inheritdoc
   */
  isAutocommit(opts) {
    return opts && opts.driverOptions && opts.driverOptions.hasOwnProperty('autocommit') ? 
      opts.driverOptions.autocommit : this.connConf && this.connConf.driverOptions && this.connConf.driverOptions.autocommit;
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
 * @param {String} operation The operation origin
 */
function expectOpts(dialect, opts, operation) {
  expect(opts, 'opts').to.be.object();

  if (operation === 'exec') {
    expect(Manager.OPERATION_TYPES, `opts.type from "${operation}"`).to.have.part.include(opts.type);
    dialect.testPending += opts.type === 'READ' || dialect.isAutocommit(opts) ? 0 : 1;
  }

  expect(opts.tx, `opts.tx from "${operation}"`).to.be.object();
  expect(opts.tx.pending, `opts.tx.pending from "${operation}"`).to.equal(dialect.testPending);
}

module.exports = TestDialect;