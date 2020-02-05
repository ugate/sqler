'use strict';

const { Manager, Dialect } = require('../../index');
const UtilOpts = require('../util/utility-options');
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
    if (connConf.dir) {
      expect(connConf.dir, 'connConf.dir').to.be.string();
      expect(connConf.dir, 'connConf.dir.length').to.not.be.empty();
    }
    expect(connConf.service, 'connConf.service').to.be.string();
    expect(connConf.service, 'connConf.service.length').to.not.be.empty();
    expect(connConf.dialect, 'connConf.dialect').to.be.string();
    expect(connConf.dialect, 'connConf.dialect.length').to.not.be.empty();

    if (connConf.substitutes) {
      expect(connConf.substitutes, 'connConf.substitutes').to.be.object();
    }

    expect(track, 'track').to.be.object();
    expect(errorLogger, 'errorLogger').to.satisfy(value => typeof value === 'boolean' || typeof value === 'function');
    expect(logger, 'logger').to.satisfy(value => typeof value === 'boolean' || typeof value === 'function');
    expect(debug, 'debug').to.be.boolean();
  }

  /**
   * @inheritdoc
   */
  async init(opts) {
    expect(opts, 'opts').to.be.object();
    if (this.connConf.driverOptions) {
      if (this.connConf.driverOptions.throwInitError) {
        throw new Error(`Test error due to "this.connConf.driverOptions.throwInitError" = ${this.connConf.driverOptions.throwInitError}`);
      }
      expect(opts.numOfPreparedStmts, `Number of prepared statements`).to.equal(this.connConf.driverOptions && this.connConf.driverOptions.numOfPreparedStmts);
    }
    return true;
  }

  /**
   * @inheritdoc
   */
  async beginTransaction() {
    this.connection = {};
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags) {
    if (UtilOpts.driverOpt('throwExecError', opts, this.connConf).value) {
      throw new Error(`Test error due to "opts.driverOptions.throwExecError" = ${
        opts.driverOptions.throwExecError} and "this.connConf.driverOptions.throwExecError" = ${this.connConf.driverOptions.throwExecError}`);
    }

    const xopts = UtilOpts.createExecOpts();

    const xoptsNoExpandedBinds = UtilOpts.createExecOpts(true);
    expectOpts(this, opts, 'exec');
    expect(opts.binds, 'opts.binds').to.be.object();
    if (xoptsNoExpandedBinds.binds) {
      expect(opts.binds, 'opts.binds').to.contain(xoptsNoExpandedBinds.binds);
    }
    if (this.connConf.binds) {
      expect(opts.binds, 'opts.binds').to.contain(this.connConf.binds);
    }
    expectExpansionBinds(sql, opts, xopts);

    if (this.connConf.substitutes) {
      for (let sub in this.connConf.substitutes) {
        if (!this.connConf.substitutes.hasOwnProperty(sub)) continue;
        if (!sql.includes(sub) && !sql.includes(this.connConf.substitutes[sub])) continue; // SQL may not be using the substitute
        expect(sql, `SQL raw substitute`).to.not.contain(sub);
        expect(sql, `SQL raw substitute`).to.contain(this.connConf.substitutes[sub]);
      }
    }

    const singleRecordKey = UtilOpts.driverOpt('singleRecordKey', opts, this.connConf), recordCount = UtilOpts.driverOpt('recordCount', opts, this.connConf);

    if (frags) {
      const fragLabel = `frags`;
      expect(frags, fragLabel).to.be.array();

      // frag names should have been removed
      for (let frag of frags) {
        expect(frag, `${fragLabel} (iteration)`).to.be.string();
        expect(frag, `${fragLabel} (iteration) length`).to.not.be.empty();
        expect(sql, `${fragLabel} (iteration) removed`).to.not.contain(frag);
      }

      // check to make sure the expected fragments are included in the SQL statement
      const fragSqlSnip = UtilOpts.driverOpt('fragSqlSnippets', opts, this.connConf);
      if (fragSqlSnip.source && fragSqlSnip.value) {
        for (let fkey in fragSqlSnip.value) {
          if (frags.includes(fkey)) {
            expect(sql).to.contain(fragSqlSnip.value[fkey]);
          }
        }
      }
    }

    expectSqlSubstitutes(sql, opts, this.connConf, frags);

    const rslt = { raw: {} };

    if (opts.hasOwnProperty('autoCommit') && !opts.autoCommit) {
      expect(this.connection, 'this.connection (beginTransaction called?)').to.not.be.undefined();
      expect(this.connection, 'this.connection (beginTransaction called?)').to.not.be.null();
      
      rslt.commit = async () => {
        this.testPending = 0;
        this.connection = null;
      };
      rslt.rollback = async () => {
        this.testPending = 0;
        this.connection = null;
      };
    }

    // set rows
    let cols = sql.match(/SELECT([\s\S]*?)FROM/i);
    if (!cols) return rslt;
    cols = cols[1].replace(/(\r\n|\n|\r)/gm, '').split(',');
    const rcrd = {};
    let ci = 0;
    for (let col of cols) {
      rcrd[col.substr(col.lastIndexOf('.') + 1)] = ++ci;
    }
    // simple test output records (single record key overrides the record count)
    if (singleRecordKey.source && sql.includes(singleRecordKey.value)) {
      rslt.rows = [rcrd];
      return rslt;
    }
    rslt.rows = [];
    for (let i = 0; i < (recordCount.value || 2); ++i) {
     rslt.rows.push(rcrd);
    }
    return rslt;
  }

  /**
   * @inheritdoc
   */
  async close() {
    this.testPending = 0;
    return 1;
  }

  /**
   * @inheritdoc
   */
  get state() {
    return {
      pending: this.testPending
    }
  }
}

/**
 * Expects options
 * @param {TestDialect} dialect The dialect instance being tested
 * @param {Manager~ExecOptions} opts The expected options
 * @param {String} operation The operation origin
 */
function expectOpts(dialect, opts, operation) {
  expect(opts, 'opts').to.be.object();

  if (operation === 'exec') {
    expect(Manager.OPERATION_TYPES, `opts.type from "${operation}"`).to.have.part.include(opts.type);
    dialect.testPending += opts.type === 'READ' || opts.autoCommit ? 0 : 1;

    expect(opts.numOfIterations, 'opts.numOfIterations').to.be.number();
    if (opts.driverOptions && opts.driverOptions.hasOwnProperty('numOfIterations')) {
      expect(opts.numOfIterations, 'opts.numOfIterations = opts.driverOptions.numOfIterations').to.equal(opts.driverOptions.numOfIterations);
    } else {
      expect(opts.numOfIterations, 'opts.numOfIterations').to.be.greaterThan(0);
    }
  }
}

/**
 * Expects binds that should have been expanded into multiple binds are persent
 * @param {String} sql The SQL being validated
 * @param {Manager~ExecOptions} opts The {@link Manager~ExecOptions} that are being validated
 * @param {Manager~ExecOptions} xopts The {@link Manager~ExecOptions} that are being validated against
 */
function expectExpansionBinds(sql, opts, xopts) {
  if (!xopts.binds || !/IN[\s\n\r]*\(/.test(sql)) return;
  for (let xopt in xopts.binds) {
    if (!xopts.binds.hasOwnProperty(xopt)) continue;
    if (!Array.isArray(xopts.binds[xopt])) continue;
    for (let xi = 0, enm, xbinds = xopts.binds[xopt]; xi < xbinds.length; ++xi) {
      enm = `${xopt}${xi || ''}`;
      expect(opts.binds[enm], `opts.binds.${enm} (binds expansion) on SQL:\n${sql}\n`).to.equal(xbinds[xi]);
      expect(sql).to.contain(`:${enm}`);
    }
  }
}

/**
 * Expects the `opts.driverOptions.substitutes` to be substituted in the SQL statement
 * @param {String} sql The SQL being validated
 * @param {Manager~ExecOptions} opts The {@link Manager~ExecOptions} that are being validated
 * @param {Manager~ExecOptions} xopts The {@link Manager~ExecOptions} that are being validated against
 */
function expectSqlSubstitutes(sql, opts, connConf) {
  expect(sql).to.not.contain('[[!');
  expect(sql).to.not.contain('[[?');
  expect(sql).to.not.contain('[[version');
  if (!opts.driverOptions || !opts.driverOptions.substitutes) return;
  if (opts.driverOptions.substitutes.dialects) {
    for (let present of opts.driverOptions.substitutes.dialects.present) {
      expect(sql).to.contain(present);
    }
    for (let absent of opts.driverOptions.substitutes.dialects.absent) {
      expect(sql).to.not.contain(absent);
    }
  }
  if (opts.driverOptions.substitutes.versions) {
    for (let present of opts.driverOptions.substitutes.versions.present) {
      expect(sql, connConf.version).to.contain(present);
    }
    for (let absent of opts.driverOptions.substitutes.versions.absent) {
      expect(sql, connConf.version).to.not.contain(absent);
    }
  }
}

module.exports = TestDialect;