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
    this.transactions = new Map();
    this.preparedStatements = new Map();

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

    expectTrack(track);

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
      expect(opts.numOfPreparedFuncs, `Number of prepared functions`).to.equal(this.connConf.driverOptions && this.connConf.driverOptions.numOfPreparedFuncs);
    }
    return true;
  }

  /**
   * @inheritdoc
   */
  async beginTransaction(txId, opts) {
    if (!this.transactions.has(txId)) this.transactions.set(txId, { pending: 0 });
    expect(opts, 'transaction options').to.be.object();
  }

  /**
   * @inheritdoc
   */
  async prepare(psId, opts) {
    if (!this.preparedStatements.has(psId)) this.preparedStatements.set(psId, { pending: 0 });
    expect(opts, 'prepared statement options').to.be.object();
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags, meta) {
    const dialect = this;

    expect(meta, 'meta').to.be.object();
    expect(meta.name, 'meta.name').to.be.string();
    expect(meta.name, 'meta.name').to.not.be.empty();
    expect(meta.path, 'meta.path').to.be.string();
    expect(meta.path, 'meta.path').to.not.be.empty();

    if (UtilOpts.driverOpt('throwExecError', opts, dialect.connConf).value) {
      const error = new Error(`Test error due to "opts.driverOptions.throwExecError" = ${
        opts.driverOptions.throwExecError} and "this.connConf.driverOptions.throwExecError" = ${this.connConf.driverOptions.throwExecError}`);
      const throwProps = UtilOpts.driverOpt('throwProperties', opts, dialect.connConf).value;
      if (throwProps) {
        error.sqler = {};
        for (let prop in throwProps) {
          error.sqler[prop] = throwProps[prop];
        }
      }
      throw error;
    }

    const xopts = UtilOpts.createExecOpts();

    const xoptsNoExpandedBinds = UtilOpts.createExecOpts(true);
    expectOpts(dialect, opts, 'exec');
    expect(opts.binds, 'opts.binds').to.be.object();
    if (xoptsNoExpandedBinds.binds) {
      expect(opts.binds, 'opts.binds').to.contain(xoptsNoExpandedBinds.binds);
    }
    if (dialect.connConf.binds) {
      expect(opts.binds, 'opts.binds').to.contain(dialect.connConf.binds);
    }
    expectExpansionBinds(sql, opts, xopts);

    if (dialect.connConf.substitutes) {
      for (let sub in dialect.connConf.substitutes) {
        if (!this.connConf.substitutes.hasOwnProperty(sub)) continue;
        if (!sql.includes(sub) && !sql.includes(dialect.connConf.substitutes[sub])) continue; // SQL may not be using the substitute
        expect(sql, `SQL raw substitute`).to.not.contain(sub);
        expect(sql, `SQL raw substitute`).to.contain(dialect.connConf.substitutes[sub]);
      }
    }

    const singleRecordKey = UtilOpts.driverOpt('singleRecordKey', opts, dialect.connConf), recordCount = UtilOpts.driverOpt('recordCount', opts, dialect.connConf);

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
      const fragSqlSnip = UtilOpts.driverOpt('fragSqlSnippets', opts, dialect.connConf);
      if (fragSqlSnip.source && fragSqlSnip.value) {
        for (let fkey in fragSqlSnip.value) {
          if (frags.includes(fkey)) {
            expect(sql).to.contain(fragSqlSnip.value[fkey]);
          }
        }
      }
    }

    expectSqlSubstitutes(sql, opts, dialect.connConf, frags);

    const rslt = { raw: {} };

    let tx, ps;

    // transaction checks
    if (!opts.hasOwnProperty('autoCommit') || !opts.autoCommit) {
      expect(opts.transactionId, 'opts.transactionId').to.be.string();
      expect(opts.transactionId, 'opts.transactionId').to.not.be.empty();

      const connLabel = `this.transactions.get('${opts.transactionId}') (beginTransaction called?)`;
      tx = dialect.transactions.get(opts.transactionId);
      expect(tx, connLabel).to.not.be.undefined();
      expect(tx, connLabel).to.not.be.null();

      tx.pending++;
      
      rslt.commit = async () => {
        if (ps) dialect.preparedStatements.delete(meta.name);
        dialect.transactions.delete(opts.transactionId);
      };
      rslt.rollback = async () => {
        if (ps) dialect.preparedStatements.delete(meta.name);
        dialect.transactions.delete(opts.transactionId);
      };
    }

    if (opts.prepareStatement) {
      const connLabel = `this.preparedStatements.get('${meta.name}') (prepare called?)`;
      ps = dialect.preparedStatements.get(meta.name);
      expect(ps, connLabel).to.not.be.undefined();
      expect(ps, connLabel).to.not.be.null();
      
      if (!tx) ps.pending++;

      rslt.unprepare = async () => {
        dialect.preparedStatements.delete(meta.name);
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
    this.transactions = new Map();
    this.preparedStatements = new Map();
    return 1;
  }

  /**
   * @inheritdoc
   */
  get state() {
    const rtn = { pending: 0 };
    for (let [id, tx] of this.transactions) {
      rtn.pending += tx.pending;
    }
    for (let [id, ps] of this.preparedStatements) {
      rtn.pending += ps.pending;
    }
    return rtn;
  }
}

/**
 * Expects a track to contain the implmented fields
 * @param {Manager~Track} track The track to expect
 */
function expectTrack(track) {
  expect(track, 'track').to.be.object();
  expectPositionalBinds(track);
  expectInterpolate(track);
}

/**
 * Expects a track to contain the implmented `interpolate` field
 * @param {Manager~Track} track The track to expect
 */
function expectInterpolate(track) {
  expect(track.interpolate, 'track.interpolate').to.be.function();
  const ipoles = [
    {
      dest: {},
      src: {
        staticProp: '${TEST_PROP}',
        someObj: {
          someProp: '${someProp}',
          someDate: '${someDate}',
          someRegExp: '${someRegExp}'
        },
        excludeProp: '${excludeProp}',
        excludeObj: {
          excludeProp1: '${excludeProp1}',
          excludeProp2: '${excludeProp2}'
        }
      },
      interpolator: {
        TEST_PROP: 'STATIC PROP',
        someProp: 'TEST OBJECT PROP',
        someDate: new Date(),
        someRegExp: /[a-z]/,
        excludeProp: 'SHOULD NOT BE INTERPOLATED',
        excludeProp1: 'SHOULD NOT BE INTERPOLATED',
        excludeProp2: 'ALSO SHOULD NOT BE INTERPOLATED'
      }
    },
    {
      dest: {},
      src: {
        notInterpolated: 'SHOW WHEN NOT ONLY INTERPOLATED',
        staticProp: '${TEST_PROP}',
        someObj: {
          someProp: '${someProp}',
          someDate: '${someDate}',
          someRegExp: '${someRegExp}'
        },
        excludeProp: '${excludeProp}',
        excludeObj: {
          excludeProp1: '${excludeProp1}',
          excludeProp2: '${excludeProp2}'
        }, // source is the inerpolator
        TEST_PROP: 'STATIC PROP',
        someProp: 'TEST OBJECT PROP',
        someDate: new Date(),
        someRegExp: /[a-z]/,
        excludeProp1: 'SHOULD NOT BE INTERPOLATED',
        excludeProp2: 'ALSO SHOULD NOT BE INTERPOLATED'
      },
      get interpolator() {
        return this.src;
      }
    }
  ];
  let ipoled, onlyIpoled;
  for (let ipole of ipoles) {
    onlyIpoled = ipole.src.hasOwnProperty('notInterpolated');
    for (let i = 0; i <= onlyIpoled ? 1 : 0; ++i) { // loop 2x for only interpoalted values to ensure they are not set when the opeion is true (i.e. i !== 0)
      ipoled = track.interpolate(ipole.dest, ipole.src, ipole.interpolator, props => props[0] !== 'excludeProp' && props[0] !== 'excludeObj', i !== 0);
      expect(ipoled, 'track.interpolate() return value').to.equal(ipole.dest);
      expect(ipoled.staticProp, 'track.interpolate() static property').to.equal(ipole.interpolator.TEST_PROP);
      expect(ipoled.someObj, 'track.interpolate() object property').to.be.object();
      expect(ipoled.someObj.someProp, 'track.interpolate() object property string value').to.equal(ipole.interpolator.someProp);
      expect(ipoled.someObj.someDate, 'track.interpolate() object property date value').to.equal(ipole.interpolator.someDate);
      expect(ipoled.someObj.someRegExp, 'track.interpolate() object property regular expression value').to.equal(ipole.interpolator.someRegExp);
      expect(ipoled.excludeObj, 'track.interpolate() exclude object properties').to.be.object();
      expect(ipoled.excludeObj.excludeProp1, 'track.interpolate() exclude object property 1 (untouched)').to.equal(ipole.src.excludeObj.excludeProp1);
      expect(ipoled.excludeObj.excludeProp2, 'track.interpolate() exclude object property 2 (untouched)').to.equal(ipole.src.excludeObj.excludeProp2);
      if (i === 0) { // interpolated values should only be set on the destination when 
        expect(ipoled.notInterpolated, 'track.interpolate() not interpolated property').to.equal(ipole.src.notInterpolated);
        if (onlyIpoled) ipole.dest = {}; // reset dest for only interpolated
      } else {
        expect(ipoled.notInterpolated, 'track.interpolate() not interpolated property').to.be.undefined();
      }
    }
  }
  expectImmutable('track', track, 'interpolate');
}

/**
 * Expects a track to contain the implmented `interpolate` field
 * @param {Manager~Track} track The track to expect
 */
function expectPositionalBinds(track) {
  expect(track.positionalBinds, 'track.positionalBinds').to.be.function();
  const cols = [':col1', ':col2'], colVals = [1, 'two'], binds = {}, bindsArray = [];
  const sql = `
    SELECT * FROM TEST
    WHERE COL1 = :col1
    AND COL2 = :col2;
  `;
  for (let i = 0; i < colVals.length; i++) {
    binds[cols[i].substr(1)] = colVals[i];
  }
  const usql = track.positionalBinds(sql, binds, bindsArray);
  expect(usql, 'track.positionalBinds SQL result').to.not.contain(cols);
  const ucount = (usql.match(/\?/g) || []).length;
  expect(ucount, 'track.positionalBinds SQL result unnamed parameter count').to.equal(cols.length);
  expect(bindsArray, 'track.positionalBinds bindsArray = column values').to.equal(colVals);

  let error;
  try {
    track.positionalBinds(sql, { col1: 1 }, bindsArray);
  } catch (err) {
    error = err;
  }
  expect(error, 'track.positionalBinds missing bind in SQL').to.be.error();

  expectImmutable('track', track, 'positionalBinds');
}

/**
 * Expects an object property to be immutable
 * @param {String} name The name for the specified object
 * @param {Object} obj The object container the use
 * @param {String} prop The property on the object container to check for immutability
 */
function expectImmutable(name, obj, prop) {
  const origFunc = obj[prop];
  let error;
  try {
    obj.interpolate = () => false;
  } catch (err){
    error = err;
  }
  expect(obj[prop], `${name}.${prop} immutable setFunc === ${name}.${prop}`).to.equal(origFunc);
  expect(error, `${name}.${prop} immutable (error)`).to.be.error();
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