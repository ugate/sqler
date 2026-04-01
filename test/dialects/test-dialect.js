'use strict';
const assert = require('node:assert/strict');
const typedefs = require('../../typedefs');
const { Manager, Dialect } = require('../../index');
const UtilOpts = require('../util/utility-options');
const Stream = require('stream');

class NoSqlErrorClass extends Error {}

class TestDialect extends Dialect {
 constructor(priv, connConf, track, errorLogger, logger, debug) {
  super(priv, connConf, track, errorLogger, logger, debug);
  this.transactions = new Map();
  this.preparedStatements = new Map();
  this.preparedStatementsInTransactions = new Map();
  this.track = track;
  assert.ok(priv && typeof priv === 'object');
  assert.equal(typeof priv.host, 'string');
  assert.notEqual(priv.host.length, 0);
  assert.equal(typeof priv.username, 'string');
  assert.notEqual(priv.username.length, 0);
  assert.equal(typeof priv.password, 'string');
  assert.notEqual(priv.password.length, 0);
  assert.ok(connConf && typeof connConf === 'object');
  assert.equal(typeof connConf.id, 'string');
  assert.notEqual(connConf.id.length, 0);
  assert.equal(typeof connConf.name, 'string');
  assert.notEqual(connConf.name.length, 0);
  if (connConf.dir) {
   assert.equal(typeof connConf.dir, 'string');
   assert.notEqual(connConf.dir.length, 0);
  }
  assert.equal(typeof connConf.service, 'string');
  assert.notEqual(connConf.service.length, 0);
  assert.equal(typeof connConf.dialect, 'string');
  assert.notEqual(connConf.dialect.length, 0);
  if (connConf.substitutes) assert.ok(connConf.substitutes && typeof connConf.substitutes === 'object');
  expectTrack(track);
  assert.ok(typeof errorLogger === 'boolean' || typeof errorLogger === 'function');
  assert.ok(typeof logger === 'boolean' || typeof logger === 'function');
  assert.equal(typeof debug, 'boolean');
 }

 async init(opts) {
  assert.ok(opts && typeof opts === 'object');
  if (this.connConf.driverOptions) {
   if (this.connConf.driverOptions.throwInitError) {
    throw new Error(`Test error due to "this.connConf.driverOptions.throwInitError" = ${this.connConf.driverOptions.throwInitError}`);
   }
   assert.equal(typeof opts.numOfPreparedFuncs, 'number');
   assert.ok(opts.numOfPreparedFuncs >= 0);
  }
  return true;
 }

 async beginTransaction(txId, opts) {
  let tx;
  if (!this.transactions.has(txId)) {
   const dialect = this;
   const release = async function() {
    const pss = dialect.preparedStatementsInTransactions.get(tx.id);
    if (pss) {
     for (const ps of pss) dialect.preparedStatements.delete(ps.id);
     dialect.preparedStatementsInTransactions.delete(tx.id);
    }
    dialect.transactions.delete(tx.id);
    tx.state.pending = 0;
    tx.state.isReleased = true;
   };
   tx = {
    id: txId,
    commit: async function(isRelease) {
     if (this.state.isReleased) return;
     this.state.committed++;
     this.state.pending = 0;
     if (isRelease) await release();
    },
    rollback: async function(isRelease) {
      if (this.state.isReleased) return;
      this.state.rolledback++;
      this.state.pending = 0;
      if (isRelease) await release();
    },
    state: { committed: 0, rolledback: 0, pending: 0, isReleased: false }
   };
   this.transactions.set(tx.id, tx);
  } else {
   tx = this.transactions.get(txId);
  }
  assert.ok(opts && typeof opts === 'object');
  return tx;
 }

 async exec(sql, opts, frags, meta) {
  if (!sql) throw new NoSqlErrorClass(`Unable to execute.\nSQL is required for options: ${JSON.stringify(opts)}`);
  const dialect = this;
  const rslt = { raw: {} };
  try {
   assert.ok(meta && typeof meta === 'object');
   assert.equal(typeof meta.name, 'string');
   assert.notEqual(meta.name.length, 0);
   assert.equal(typeof meta.path, 'string');
   assert.notEqual(meta.path.length, 0);
   handleThrowError(dialect, opts);
   if (!TestDialect.BYPASS_NEXT_EXEC_OPTS_CHECK) expectBinds(dialect, sql, opts);
   expectRawSubstitutes(dialect, sql);
   expectFrags(dialect, sql, opts, frags);
   expectSqlSubstitutes(sql, opts);
   if (opts && opts.prepareStatement) await prepare(dialect, meta.name, opts);
   if (!TestDialect.BYPASS_NEXT_EXEC_OPTS_CHECK) expectTransactionPreparedStatement(dialect, opts, meta, rslt);
   const isRead = opts.type === 'READ';
   const isReadStream = opts.stream >= 0 && isRead;
   const isWriteStream = !isRead && !isReadStream && opts.stream >= 0;
   const singleRecordKey = UtilOpts.driverOpt('singleRecordKey', opts, dialect.connConf);
   const recordCount = UtilOpts.driverOpt('recordCount', opts, dialect.connConf);
   const rcrdCnt = (singleRecordKey.source && sql.includes(singleRecordKey.value) ? 1 : (recordCount.value || 2));
   if (isWriteStream) {
    const writable = this.track.writable(opts, async function bindsRelay(batch) { return batch; });
    rslt.rows = [writable];
    return rslt;
   }
   let cols = sql.match(/SELECT([\s\S]*?)FROM/i);
   cols = cols && cols[1].replace(/(\r\n|\n|\r)/gm, '').split(',');
   const setColProps = (rcrd) => {
    let ci = 0;
    for (const col of cols) rcrd[col.substr(col.lastIndexOf('.') + 1)] = ++ci;
    return rcrd;
   };
   if (isReadStream) {
    const readables = new Array(rcrdCnt);
    for (let i = 0; i < rcrdCnt; i++) readables[i] = setColProps({});
    const readable = this.track.readable(opts, Stream.Readable.from(readables, { objectMode: true }));
    rslt.rows = [readable];
   } else {
    if (!cols) return rslt;
    rslt.rows = rslt.rows || [];
    for (let i = 0; i < rcrdCnt; ++i) rslt.rows.push(setColProps({}));
   }
  } finally {
   TestDialect.BYPASS_NEXT_EXEC_OPTS_CHECK = false;
  }
  return rslt;
 }

 async close() {
  this.transactions.clear();
  this.preparedStatements.clear();
  this.preparedStatementsInTransactions.clear();
  return 1;
 }

 get state() {
  const rtn = { pending: 0 };
  for (const [, tx] of this.transactions) rtn.pending += tx.state.pending;
  for (const [, ps] of this.preparedStatements) rtn.pending += ps.pending;
  return rtn;
 }

 static get NoSqlError() {
  return NoSqlErrorClass;
 }
}

async function prepare(dialect, psId, opts) {
  assert.ok(opts && typeof opts === 'object');
  let ps = dialect.preparedStatements.has(psId) ? dialect.preparedStatements.get(psId) : null;
  if (!ps) dialect.preparedStatements.set(psId, ps = { id: psId, pending: 0 });
  if (opts.transactionId) {
   if (dialect.preparedStatementsInTransactions.has(opts.transactionId)) {
    dialect.preparedStatementsInTransactions.get(opts.transactionId).push(ps);
   } else {
    dialect.preparedStatementsInTransactions.set(opts.transactionId, [ps]);
   }
  }
}

function expectTrack(track) {
  assert.ok(track && typeof track === 'object');
  expectPositionalBinds(track);
  expectInterpolate(track);
  expectStream(track);
}

function expectInterpolate(track) {
  assert.equal(typeof track.interpolate, 'function');
  const ipoles = [
   {
    dest: {},
    src: {
     staticProp: '${TEST_PROP}',
     someObj: { someProp: '${someProp}', someDate: '${someDate}', someRegExp: '${someRegExp}' },
     excludeProp: '${excludeProp}',
     excludeObj: { excludeProp1: '${excludeProp1}', excludeProp2: '${excludeProp2}' }
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
     someObj: { someProp: '${someProp}', someDate: '${someDate}', someRegExp: '${someRegExp}' },
     excludeProp: '${excludeProp}',
     excludeObj: { excludeProp1: '${excludeProp1}', excludeProp2: '${excludeProp2}' },
     TEST_PROP: 'STATIC PROP',
     someProp: 'TEST OBJECT PROP',
     someDate: new Date(),
     someRegExp: /[a-z]/,
     excludeProp1: 'SHOULD NOT BE INTERPOLATED',
     excludeProp2: 'ALSO SHOULD NOT BE INTERPOLATED'
    },
    get interpolator() { return this.src; }
   }
  ];
  let ipoled;
  let onlyIpoled;
  for (const ipole of ipoles) {
   onlyIpoled = Object.prototype.hasOwnProperty.call(ipole.src, 'notInterpolated');
   for (let i = 0; i <= (onlyIpoled ? 1 : 0); ++i) {
    ipoled = track.interpolate(ipole.dest, ipole.src, ipole.interpolator, props => props[0] !== 'excludeProp' && props[0] !== 'excludeObj', i !== 0);
    assert.equal(ipoled, ipole.dest);
    assert.equal(ipoled.staticProp, ipole.interpolator.TEST_PROP);
    assert.ok(ipoled.someObj && typeof ipoled.someObj === 'object');
    assert.equal(ipoled.someObj.someProp, ipole.interpolator.someProp);
    assert.equal(ipoled.someObj.someDate, ipole.interpolator.someDate);
    assert.equal(ipoled.someObj.someRegExp, ipole.interpolator.someRegExp);
    assert.ok(ipoled.excludeObj && typeof ipoled.excludeObj === 'object');
    assert.equal(ipoled.excludeObj.excludeProp1, ipole.src.excludeObj.excludeProp1);
    assert.equal(ipoled.excludeObj.excludeProp2, ipole.src.excludeObj.excludeProp2);
    if (i === 0) {
     assert.equal(ipoled.notInterpolated, ipole.src.notInterpolated);
     if (onlyIpoled) ipole.dest = {};
    } else {
     assert.equal(ipoled.notInterpolated, undefined);
    }
   }
  }
  expectImmutable(track, 'interpolate');
}

function expectStream(track) {
  assert.equal(typeof track.readable, 'function');
  let batches;
  const readable = track.readable({ stream: 0 }, Stream.Readable.from([{ test: 1 }]), async batch => {
   batches = batches ? [...batches, ...batch] : [...batch];
  });
  assert.ok(readable instanceof Stream.Readable);
  expectImmutable(track, 'readable');
  assert.equal(typeof track.writable, 'function');
  batches = null;
  const writable = track.writable({ stream: 0 }, async batch => {
   batches = batches ? [...batches, ...batch] : [...batch];
  });
  assert.ok(writable instanceof Stream.Writable);
  expectImmutable(track, 'writable');
}

function handleThrowError(dialect, opts) {
  if (UtilOpts.driverOpt('throwExecError', opts, dialect.connConf).value) {
   const throwOpt = UtilOpts.driverOpt('throwExecError', opts, dialect.connConf);
   const error = new Error(`Test error due to "throwExecError" = ${throwOpt.value}`);
   const throwProps = UtilOpts.driverOpt('throwProperties', opts, dialect.connConf).value;
   if (throwProps) {
    error.sqler = {};
    for (const prop in throwProps) error.sqler[prop] = throwProps[prop];
   }
   throw error;
  }
}

function expectPositionalBinds(track) {
  assert.equal(typeof track.positionalBinds, 'function');
  const cols = [':col1', ':col2'];
  const colVals = [1, 'two'];
  const binds = {};
  const bindsArray = [];
  const sql = ' SELECT * FROM TEST WHERE COL1 = :col1 AND COL2 = :col2; ';
  for (let i = 0; i < colVals.length; i++) binds[cols[i].substr(1)] = colVals[i];
  const usql = track.positionalBinds(sql, binds, bindsArray);
  assert.ok(!usql.includes(cols[0]) && !usql.includes(cols[1]));
  const ucount = (usql.match(/\?/g) || []).length;
  assert.equal(ucount, cols.length);
  assert.deepEqual(bindsArray, colVals);
  assert.throws(() => track.positionalBinds(sql, { col1: 1 }, bindsArray));
  expectImmutable(track, 'positionalBinds');
}

function expectImmutable(obj, prop) {
  const origFunc = obj[prop];
  assert.throws(() => {
   obj[prop] = () => false;
  });
  assert.equal(obj[prop], origFunc);
}

function expectBinds(dialect, sql, opts) {
  const xopts = UtilOpts.createExecOpts();
  const xoptsNoExpandedBinds = UtilOpts.createExecOpts(true);
  expectOpts(opts, 'exec');

  if (!opts.binds || Array.isArray(opts.binds)) return;

  assert.equal(typeof opts.binds, 'object');

  if (xoptsNoExpandedBinds.binds) {
   for (const key of Object.keys(xoptsNoExpandedBinds.binds)) {
    if (Object.prototype.hasOwnProperty.call(opts.binds, key)) {
     assert.deepEqual(opts.binds[key], xoptsNoExpandedBinds.binds[key]);
    }
   }
  }

  if (dialect.connConf.binds) {
   for (const key of Object.keys(dialect.connConf.binds)) {
    if (Object.prototype.hasOwnProperty.call(opts.binds, key)) {
     assert.deepEqual(opts.binds[key], dialect.connConf.binds[key]);
    }
   }
  }

  expectExpansionBinds(sql, opts, xopts);
}

function expectOpts(opts, operation) {
  assert.ok(opts && typeof opts === 'object');
  if (operation === 'exec') assert.ok(Manager.OPERATION_TYPES.includes(opts.type));
}

function expectExpansionBinds(sql, opts, xopts) {
  if (!xopts.binds || !opts.binds || Array.isArray(opts.binds) || !/IN[\s\n\r]*\(/.test(sql)) return;
  for (const xopt in xopts.binds) {
   if (!Object.prototype.hasOwnProperty.call(xopts.binds, xopt)) continue;
   if (!Array.isArray(xopts.binds[xopt])) continue;
   let xsql = '';
   for (let xi = 0, enm, xbinds = xopts.binds[xopt]; xi < xbinds.length; ++xi) {
    enm = `${xopt}${xi || ''}`;
    assert.equal(opts.binds[enm], xbinds[xi]);
    assert.ok(sql.includes(`:${enm}`));
    xsql += `${xi === 0 ? '' : ' OR '}UPPER(SOME_EXP_COL) = UPPER(:${enm})`;
   }
   assert.ok(sql.includes(xsql));
  }
}

function expectRawSubstitutes(dialect, sql) {
  if (dialect.connConf.substitutes) {
   for (const sub in dialect.connConf.substitutes) {
    if (!Object.prototype.hasOwnProperty.call(dialect.connConf.substitutes, sub)) continue;
    if (!sql.includes(sub) && !sql.includes(dialect.connConf.substitutes[sub])) continue;
    assert.ok(!sql.includes(sub));
    assert.ok(sql.includes(dialect.connConf.substitutes[sub]));
   }
  }
}

function expectSqlSubstitutes(sql, opts) {
  assert.ok(!sql.includes('[[!'));
  assert.ok(!sql.includes('[[?'));
  assert.ok(!sql.includes('[[version'));
  if (!opts.driverOptions || !opts.driverOptions.substitutes) return;
  if (opts.driverOptions.substitutes.dialects) {
   for (const present of opts.driverOptions.substitutes.dialects.present) assert.ok(sql.includes(present));
   for (const absent of opts.driverOptions.substitutes.dialects.absent) assert.ok(!sql.includes(absent));
  }
  if (opts.driverOptions.substitutes.versions) {
   for (const present of opts.driverOptions.substitutes.versions.present) assert.ok(sql.includes(present));
   for (const absent of opts.driverOptions.substitutes.versions.absent) assert.ok(!sql.includes(absent));
  }
}

function expectFrags(dialect, sql, opts, frags) {
  if (frags) {
   assert.ok(Array.isArray(frags));
   for (const frag of frags) {
    assert.equal(typeof frag, 'string');
    assert.notEqual(frag.length, 0);
    assert.ok(!sql.includes(frag));
   }
   const fragSqlSnip = UtilOpts.driverOpt('fragSqlSnippets', opts, dialect.connConf);
   if (fragSqlSnip.source && fragSqlSnip.value) {
    for (const fkey in fragSqlSnip.value) {
     if (frags.includes(fkey)) assert.ok(sql.includes(fragSqlSnip.value[fkey]));
    }
   }
  }
}

function expectTransactionPreparedStatement(dialect, opts, meta, rslt) {
  let tx = null;
  let ps;

  if (!Object.prototype.hasOwnProperty.call(opts, 'autoCommit') || !opts.autoCommit) {
   assert.equal(typeof opts.transactionId, 'string');
   assert.notEqual(opts.transactionId.length, 0);
   tx = dialect.transactions.get(opts.transactionId) || null;
   if (tx) tx.state.pending++;
  }

  if (opts.prepareStatement) {
   ps = dialect.preparedStatements.get(meta.name);
   assert.ok(ps);

   if (tx) {
    const pstx = dialect.preparedStatementsInTransactions.get(tx.id);
    if (!pstx) {
     dialect.preparedStatementsInTransactions.set(tx.id, [ps]);
    }
   } else if (!opts.transactionId) {
    ps.pending++;
   }

   rslt.unprepare = async () => {
    dialect.preparedStatements.delete(meta.name);
    if (tx) {
     const pstx = dialect.preparedStatementsInTransactions.get(tx.id);
     if (pstx) {
      const remaining = pstx.filter(item => item.id !== meta.name);
      if (remaining.length) dialect.preparedStatementsInTransactions.set(tx.id, remaining);
      else dialect.preparedStatementsInTransactions.delete(tx.id);
     }
    }
   };
  }
}

module.exports = TestDialect;
