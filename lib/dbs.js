'use strict';

const Utils = require('./utils');
const typedefs = require('../typedefs');

const COMPARE = Object.freeze({
  '=': function eq(x, y) { return x === y; },
  '<': function lt(x, y) { return x < y; },
  '>': function gt(x, y) { return x > y; },
  '<=': function lteq(x, y) { return x <= y; },
  '>=': function gteq(x, y) { return x >= y; },
  '<>': function noteq(x, y) { return x !== y; }
});

/**
 * Database service
 * @private
 */
 class DBS {

  /**
   * Database service constructor
   * @constructs DBS
   * @param {typedefs.Dialect} dialect the database dialect implementation/executor to use
   * @param {typedefs.SQLERConnectionOptions} conn the connection options
   */
  constructor(dialect, conn) {
    const dbs = internal(this);
    dbs.at.dialect = dialect;
    dbs.at.dialectName = conn.dialect.toLowerCase();
    dbs.at.errorLogging = conn.errorLogging;
    dbs.at.logging = conn.logging;
    dbs.at.version = conn.version || 0;
  }

  /**
   * Initializes the database service
   * @param {Object} [opts] initializing options passed into the underlying database implementation/executor
   * @returns {*} Any truthy value that indicates the initialization was successful
   */
  async init(opts) {
    const dbs = internal(this);
    return await dbs.at.dialect.init(opts);
  }

  /**
   * Begins a transaction
   * @param {typedefs.SQLERTransactionOptions} [opts={}] The passed transaction options
   * @returns {typedefs.SQLERTransaction} The transaction that has been started
   */
  async beginTransaction(opts) {
    const dbs = internal(this);
    return dbs.at.dialect.beginTransaction(Utils.generateGUID(), opts || {});
  }

  /**
  * Executes SQL using the underlying framework API
  * @param {String} name The name given to the SQL file
  * @param {String} fpth The originating file path where the SQL resides
  * @param {String} sql The SQL to execute with optional substitutions {@link DBS#frag}
  * @param {typedefs.SQLERExecOptions} opts The eectution options
  * @param {String[]} frags The frament keys within the SQL that will be retained
  * @param {(typedefs.SQLERExecErrorOptions | Boolean)} [errorOpts] Truthy to return any errors thrown during execution rather than throwing them.
  * Can also pass {@link typedefs.SQLERExecErrorOptions} for more control over execution errors.
  * @returns {typedefs.SQLERExecResults} The execution results
  */
  async exec(name, fpth, sql, opts, frags, errorOpts) {
    const dbs = internal(this);
    const sqlf = dbs.this.segmentSubs(sql, opts.binds, frags);
    // framework that executes SQL may output SQL, so, we dont want to output it again if logging is on
    if (dbs.at.logging) {
      dbs.at.logging(`Executing SQL ${fpth} with options ${JSON.stringify(opts)}${frags ? ` framents used ${JSON.stringify(frags)}` : ''}`);
    }
    /** @type {typedefs.SQLERExecResults} */
    let rslt;
    try {
      const meta = { name, path: fpth };
      rslt = await dbs.at.dialect.exec(sqlf, opts, frags, meta, errorOpts); // execute the prepared SQL statement
    } catch (err) {
      try {
        /** @type {typedefs.SQLERExecOptions} */
        const eopts = JSON.parse(JSON.stringify(opts));
        eopts.binds = errorOpts && errorOpts.includeBindValues ? eopts.binds : Object.keys(opts.binds);
        if (dbs.at.errorLogging) {
          dbs.at.errorLogging(`SQL ${eopts.name ? `named "${eopts.name}" at ` : ''
          }${fpth} failed ${err.message || JSON.stringify(err)} (options: ${JSON.stringify(eopts)}, state: ${
            JSON.stringify(dbs.at.dialect.state)
          })`);
        }
        err[typedefs.MOD_KEY] = err[typedefs.MOD_KEY] || {};
        err[typedefs.MOD_KEY].name = name;
        err[typedefs.MOD_KEY].file = fpth;
        err[typedefs.MOD_KEY].sql = sqlf;
        err[typedefs.MOD_KEY].options = eopts;
        err[typedefs.MOD_KEY].fragments = frags;
        err.message = `${err.message}\n${JSON.stringify(err[typedefs.MOD_KEY], null, ' ')}`;
      } catch (frmtErr) {
        if (dbs.at.errorLogging) {
          dbs.at.errorLogging(`Failed to set ${typedefs.MOD_KEY} error properties for error at SQL: ${fpth}`, frmtErr);
        }
      }
      if (errorOpts && errorOpts.handler && typeof errorOpts.handler === 'function') {
        errorOpts.handler(err);
      }
      if (errorOpts === true || (errorOpts && errorOpts.returnErrors)){
        return { error: err };
      }
      throw err;
    }
    if (dbs.at.logging) {
      dbs.at.logging(`SQL ${fpth} returned with ${(rslt && rslt.rows && rslt.rows.length) || 0} records (options: ${JSON.stringify(opts)}, state: ${
        JSON.stringify(dbs.at.dialect.state)
      })`);
    }
    return rslt;
  }

  /**
  * Replaces or removes tagged substitution segments that appear in an SQL statement
  * - __Expansions__ - Expands _bind_ variables that contain an array of values when they appear in the SQL statement. For example, an SQL statement with a section that contains
  * `IN (:someParam)` and _binds_ of `{ someParam: [1,2,3] }` would become `IN (:someParam, :someParam1, :someParam2)` with _binds_ of `{ someParam: 1, someParam1: 2, SomeParam2: 3 }`
  * - __Dialects__ - Replaces SQL segments that contain an open `[[! myDialectName]]` and closing `[[!]]` with the SQL content that is between the opening and closing _dialect_ tags
  * when the {@link typedefs.SQLERConnectionOptions} contains the designated _dialect_ name (`myDialectName` in this case). For example, 
  * `[[! oracle]] SOME_COL = SUBSTR(SOME_COL, 1, 1) [[!]] [[! mssql]] SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1) [[!]]`
  * would become `SOME_COL = SUBSTR(SOME_COL, 1, 1)` when using an `oracle` dialect, `SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1)` when using an `mssql` dialect and omitted using any
  * other dialect.
  * - __Versions__ - Replaces SQL segments that contain an open `[[version = 1]]` and closing `[[version]]` with the SQL content that is between the opening and closing _version_ tags
  * when the {@link typedefs.SQLERConnectionOptions} contains a _version_ that satisfys the comparative operator for the version within the tag designator. For example,
  * `[[version <= 1]] SOME_OLD_COL [[version]] [[version > 1]] SOME_NEW_COL [[version]]` would become `SOME_OLD_COL` using a {@link typedefs.SQLERConnectionOptions} _version_ that is
  * less than or equal to `1`, but woud become `SOME_NEW_COL` when the _version_ is greater than `1`.
  * - __Fragments__ - Replaces SQL segments that contain an open `[[? someKey]]` and closing `[[?]]` with the SQL content that is between the opening and closing _fragment_ tags when
  * the `keys` contain the designated fragment identifier. For example, `WHERE SOME_COL1 = 1 [[? someKey]] AND SOME_COL2 = 2 [[?]]` would become `WHERE SOME_COL1 = 1 AND SOME_COL2 = 2`
  * when `keys` contains `[ 'someKey' ]`. If `keys` does not contain `someKey`, the statement would just become `WHERE SOME_COL1 = 1`.
  * @param {String} sql The SQL to defragement
  * @param {Object} [binds] An object that contains the SQL parameterized `binds` that will be used for parameterized array composition
  * @param {String[]} [frags] Fragment keys which will remain intact within the SQL
  * @returns {String} The defragmented SQL
  */
 segmentSubs(sql, binds, frags) {
    const dbs = internal(this);
    // expansion substitutes
    if (binds) {
      // AND/OR conjunction expansions
      sql = sql.replace(/\[\[(OR|AND)([\S\s]*?)(:)(\w+)([\S\s]*?)\s*\]\]/gi, function sqlExpandConjRpl(match, conjunction, prefix, bindKey, bindName, suffix) {
        return DBS.segmentSubExpanded(binds, bindKey, bindName, ` ${conjunction}`, prefix, suffix);
      });
      // simple expansions using comma separations
      sql = sql.replace(/(:)([a-z]+[0-9]*?)/gi, function sqlArrayRpl(match, bindKey, bindName) {
        return DBS.segmentSubExpanded(binds, bindKey, bindName);
      });
    }
    // dialect substitutes
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[\!(?!\[\[\!)\s*(\w+)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[\!\]\]((?:\r?\n|\n)*)/g, function sqlDiaRpl(match, lb1, key, fsql, lb2) {
      return (key && key.toLowerCase() === dbs.at.dialectName && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    // version substitutes
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[version(?!\[\[version)\s*(=|<=?|>=?|<>)\s*[+-]?(\d+\.?\d*)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[version\]\]((?:\r?\n|\n)*)/gi, function sqlVerRpl(match, lb1, key, ver, fsql, lb2) {
      return (key && ver && !isNaN(ver = parseFloat(ver)) && COMPARE[key](dbs.at.version, ver) && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    // fragment substitutes
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[\?(?!\[\[\?)\s*(\w+)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[\?\]\]((?:\r?\n|\n)*)/g, function sqlFragRpl(match, lb1, key, fsql, lb2) {
      return (key && frags && frags.indexOf(key) >= 0 && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    return sql;
  }

  /**
   * Expenads a bind parameter using surrounding separators and expands the binds to reflect multiple values.
   * @param {Object} binds The key/value bind parameters to use
   * @param {String} bindKey The key that will be used when expanding the binding parameter names (e.g. `:`)
   * @param {String} bindName The bound parameter that will be expanded
   * @param {String} [conjunction=', '] The conjunction that will be used to separate the expanded binds
   * (e.g. conjunction = ', '; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
   * `:myBind, :myBind1` with `binds = { myBind: 1, myBind1: 2 }`)
   * @param {String} prefix The prefix that will be used before each expanded bind parameter
   * (e.g. `prefix = 'UPPER('; suffix = ')'; conjunction = ' OR'; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
   * `UPPER(:myBind) OR UPPER(:myBind1)` with `binds = { myBind: 1, myBind1: 2 }`)
   * @param {String} suffix The suffix that will be used after each expended bind parameter
   * (e.g. `prefix = 'UPPER('; suffix = ')'; conjunction = ' OR'; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
   * `UPPER(:myBind) OR UPPER(:myBind1)` with `binds = { myBind: 1, myBind1: 2 }`)
   */
  static segmentSubExpanded(binds, bindKey, bindName, conjunction = ', ', prefix = '', suffix = '') {
    let newKeys = '';
    for (let i = 0, vals = bindName && Array.isArray(binds[bindName]) && binds[bindName], l = vals && vals.length; i < l; ++i) {
      newKeys += `${(newKeys && conjunction) || ''}${prefix}${bindKey}${bindName}${i || ''}${suffix}`; // set SQL expanded binds
      binds[bindName + (i || '')] = vals[i]; // set expanded binds
    }
    return newKeys || (bindKey + bindName); // replace with new key(s) or leave as-is
  }

  /**
   * Iterates through and terminates the different database connection pools
   */
  async close() {
    const dbs = internal(this);
    return dbs.at.dialect.close();
  }

  /**
   * @returns {typedefs.SQLERState} The managed state of the {@link Dialect}
   */
  get state() {
    const dbs = internal(this);
    return dbs.at.dialect.state;
  }
}

module.exports = DBS;

// private mapping
let map = new WeakMap();
let internal = function (object) {
  if (!map.has(object)) {
    map.set(object, {});
  }
  return {
    at: map.get(object),
    this: object
  };
};