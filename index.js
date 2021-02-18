'use strict';

const Dialect = require('./lib/dialect');

const Asynchro = require('asynchro');
const Fs = require('fs');
const { format } = require('util');
const Path = require('path');
const CRUD_TYPES = Object.freeze(['CREATE', 'READ', 'UPDATE', 'DELETE']);
const COMPARE = Object.freeze({
  '=': function eq(x, y) { return x === y; },
  '<': function lt(x, y) { return x < y; },
  '>': function gt(x, y) { return x > y; },
  '<=': function lteq(x, y) { return x <= y; },
  '>=': function gteq(x, y) { return x >= y; },
  '<>': function noteq(x, y) { return x !== y; }
});
const MOD_KEY = 'sqler'; // module key used for the object namespace on errors and logging
const NS = 'db'; // namespace on Manager where SQL functions will be added

/**
 * The database(s) manager entry point that autogenerates/manages SQL execution functions from underlying SQL statement files.
 * Vendor-specific implementations should implement {@link Dialect} and pass the class or module path into the constructor as `conf.db.dialects.myDialectClassOrModulePath`.
 * See [README.md](index.html) for more details about SQL related features.
 * A manager will contain the following properties:
 * - `db` - The database accessible object where all of the constructed connections reside. For example
 * - `db.<CONN_NAME>` - There will be a property assigned for each database connection configured during construction. For example, when _<CONN_NAME>_ is _myConn_, the
 * manager instance will be accessible via _manager.db.myConn_.
 * - `db.<CONN_NAME>.<PREPARED_FUNC_PATHS>` The generated SQL executable {@link SQLERPreparedFunction}(s). Assuming a _<CONN_NAME>_ of _myConn_ and a path of
 * _/db/myConn/read.my.table.sql_, the accessible {@link SQLERPreparedFunction} may be accessible via _db.myConn.read.my.table()_.
 * - `db.<CONN_NAME>.beginTransaction` - A function that accepts a single {@link SQLERTransactionOptions} that begins a transaction for a given database connection pool.
 */
class Manager {

  /**
  * Creates a new database manager. Vendor-specific implementations should have constructors that accept properties defined by {@link Dialect}.
  * @param {SQLERConfigurationOptions} conf The configuration options
  * @param {SQLERCache} [cache] the {@link SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
  * @param {(Function | Boolean)} [logging] the `function(dbNames)` that will return a name/dialect specific `function(obj1OrMsg [, obj2OrSubst1, ..., obj2OrSubstN]))` that will handle database logging.
  * Pass `true` to use the console. Omit to disable logging altogether.
  */
  constructor(conf, cache, logging) {
    if (!conf) throw new Error('Database configuration is required');
    if (!conf.db || !conf.db.dialects) throw new Error('Database configuration.db.dialects are required');
    if (!conf.univ || !conf.univ.db || !Object.keys(conf.univ.db).length) throw new Error('Database configuration.univ.db properties are required');
    if (!Array.isArray(conf.db.connections) || !conf.db.connections.length) throw new Error('Database configuration.db.connections must contain at least one connection');
    const connCnt = conf.db.connections.length;
    const mgr = internal(this);
    mgr.at.track = {};
    Object.defineProperty(mgr.at.track, 'interpolate', {
      value: interpolate,
      writable: false
    });
    Object.defineProperty(mgr.at.track, 'positionalBinds', {
      value: positionalBinds,
      writable: false
    });
    mgr.this[NS] = {};
    mgr.at.debug = conf.debug;
    mgr.at.privDB = conf.univ.db;
    mgr.at.dialects = conf.db.dialects;
    mgr.at.mainPath = conf.mainPath || (require.main && require.main.filename.replace(/([^\\\/]*)$/, '')) || process.cwd();
    mgr.at.privatePath = conf.privatePath || process.cwd();
    mgr.at.sqls = new Array(connCnt);
    mgr.at.logError = logging === true ? generateLogger(console.error, [MOD_KEY, 'db', 'error']) : logging && logging([MOD_KEY, 'db', 'error']);
    mgr.at.log = logging === true ? generateLogger(console.log, [MOD_KEY, 'db']) : logging && logging([MOD_KEY, 'db']);
    mgr.at.connNames = new Array(connCnt);
    //const reserved = Object.getOwnPropertyNames(Manager.prototype);
    for (let i = 0; i < connCnt; ++i) {
      addConnectionToManager(mgr, conf.db.connections[i], i, cache, logging);
    }
  }

  /**
   * Adds a connection configuration to the manager and initializes the database connection
   * @param {SQLERConnectionOptions} conn The connection options that will be added to the manager
   * @param {SQLERPrivateOptions} [priv] The private options that contain the connection credentials that should match `priv[conn.id]`. When omitted, an attempt to use the private options passed
   * into the constructor to make a `privPassedIntoConstructor[conn.id]` match.
   * @param {SQLERCache} [cache] the {@link SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
   * @param {(Function | Boolean)} [logging] the `function(dbNames)` that will return a name/dialect specific `function(obj1OrMsg [, obj2OrSubst1, ..., obj2OrSubstN]))` that will handle database logging.
   * Pass `true` to use the console. Omit to disable logging altogether.
   * @param {Boolean} [returnErrors] Truthy to return errors, otherwise, any encountered errors will be thrown
   * @returns {SQLEROperationResults} The results
   */
  async addConnection(conn, priv, cache, logging, returnErrors) {
    const mgr = internal(this);
    addConnectionToManager(mgr, conn, null, cache, logging, priv);
    const rslt = await operation(mgr, 'init', { returnErrors });
    if (returnErrors && rslt.errors && rslt.errors.length) {
      if (mgr.at.logError) {
        mgr.at.logError(`Failed to initialize connection ID ${conn.id} for ${conn.name} database`, ...errors);
      }
    } else if (mgr.at.log) {
      mgr.at.log(`Connection ID ${conn.id} for ${conn.name} database is ready for use`);
    }
    return rslt;
  }

  /**
   * Initializes the configured database connections
   * @param {Boolean} [returnErrors] Truthy to return errors, otherwise, any encountered errors will be thrown
   * @returns {SQLEROperationResults} The results
   */
  async init(returnErrors) {
    const mgr = internal(this);
    if (mgr.at.isInit) throw new Error(`[${mgr.at.connNames.join()}] database(s) are already initialized`);
    const rslt = await operation(mgr, 'init', { returnErrors });
    mgr.at.isInit = true;
    if (returnErrors && rslt.errors && rslt.errors.length) {
      if (mgr.at.logError) {
        mgr.at.logError(`Failed to initialize one or more [${mgr.at.connNames.join()}] database(s)`, ...errors);
      }
    } else if (mgr.at.log) {
      mgr.at.log(`[${mgr.at.connNames.join()}] database(s) are ready for use`);
    }
    return rslt;
  }

   /**
   * Composes the {@link SQLERState} on either all the connections used by the manager or on the specified connection names.
   * @param {SQLEROperationOptions} [opts] The {@link SQLEROperationOptions} to use
   * @param {...String} [connNames] The connection names to perform the check on (defaults to all connections)  
   * @returns {SQLEROperationResults} The results
   */
  async state(opts, ...connNames) {
    return operation(internal(this), 'state', opts, connNames);
  }
 
  /**
   * Closes all database pools/connections/etc.
   * @returns {SQLEROperationResults} The results
   */
  async close() {
    return operation(internal(this), 'close');
  }

  /**
   * @returns {String[]} The operation types
   */
  static get OPERATION_TYPES() {
    return CRUD_TYPES;
  }
}

/**
 * Adds a connection configuration to a manager
 * @private
 * @param {Manager} mgr The manager to add the connection to
 * @param {SQLERConnectionOptions} conn The connection options that will be added to the manager
 * @param {Integer} [index] The index at which the connection options will be added to
 * @param {SQLERCache} [cache] the {@link SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
 * @param {(Function | Boolean)} [logging] the `function(dbNames)` that will return a name/dialect specific `function(obj1OrMsg [, obj2OrSubst1, ..., obj2OrSubstN]))` that will handle database logging.
 * Pass `true` to use the console. Omit to disable logging altogether.
 * @param {SQLERPrivateOptions} [priv] The private options that contain the connection credentials that should match `priv[conn.id]`. When omitted, an attempt to use the private options passed
 * into the constructor to make a `privPassedIntoConstructor[conn.id]` match.
 */
function addConnectionToManager(mgr, conn, index, cache, logging, priv) {
  const isExpand = !index && !Number.isInteger(index);
  let idx = index, dialect, dlct, privy;
  if (isExpand) { // expand connections
    idx = mgr.at.sqls.length;
    mgr.at.connNames.length = ++mgr.at.sqls.length;
  }
  if (!conn.id) throw new Error(`Connection must have an "id" at: ${JSON.stringify(conn)}`);
  if (!conn.name) throw new Error(`Connection must have have a valid "name" at: ${JSON.stringify(conn)}`);
  if (!conn.dialect || typeof conn.dialect !== 'string') throw new Error(`Connection ID ${conn.id} must have have a valid "dialect" name at: ${JSON.stringify(conn)}`);
  privy = priv || mgr.at.privDB[conn.id]; // pull host/credentials from external conf resource
  if (!privy) throw new Error(`Connection ID ${conn.id} has an "id" that cannot be found within the Manager constructor provided "conf.univ.db" at: ${JSON.stringify(conn)}`);
  privy = JSON.parse(JSON.stringify(privy)); // need to make a clone since additional properties will be added
  privy.privatePath = mgr.at.privatePath;
  conn.host = conn.host || privy.host;
  dlct = conn.dialect.toLowerCase();
  if (!mgr.at.dialects.hasOwnProperty(dlct)) {
    throw new Error(`Database configuration.db.dialects does not contain an implementation definition/module for ${dlct} and connection ID ${conn.id} for host ${conn.host} at: ${JSON.stringify(conn)}`);
  }
  if (typeof mgr.at.dialects[dlct] === 'string') {
    if (/^[a-z@]/i.test(mgr.at.dialects[dlct])) mgr.at.dialects[dlct] = require(mgr.at.dialects[dlct]);
    else mgr.at.dialects[dlct] = require(Path.join(process.cwd(), mgr.at.dialects[dlct]));
  }
  //if (!(mgr.at.dialects[dlct] instanceof Dialect)) throw new Error(`Database dialect for ${dlct} is not an instance of a sqler "${Dialect.constructor.name}" at connection ID ${conn.id} for host ${conn.host}`);
  if (conn.log !== false && !conn.log) conn.log = [];
  if (conn.logError !== false && !conn.logError) conn.logError = [];
  if (conn.log !== false) {
    let ltags = [...conn.log, MOD_KEY, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
    conn.logging = logging === true ? generateLogger(console.log, ltags) : logging && logging(ltags); // override dialect non-error logging
  }
  if (conn.logError !== false) {
    let ltags = [...conn.logError, MOD_KEY, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
    conn.errorLogging = logging === true ? generateLogger(console.error, ltags) : logging && logging(ltags); // override dialect error logging
  }
  dialect = new mgr.at.dialects[dlct](privy, conn, mgr.at.track, conn.errorLogging || false, conn.logging || false, mgr.at.debug || false);
  // prepared SQL functions from file(s) that reside under the defined name and dialect (or "default" when dialect is flagged accordingly)
  if (mgr.this[NS][conn.name]) throw new Error(`Database connection ID ${conn.id} cannot have a duplicate name for ${conn.name}`);
  //if (reserved.includes(conn.name)) throw new Error(`Database connection name ${conn.name} for ID ${conn.id} cannot be one of the following reserved names: ${reserved}`);
  mgr.at.sqls[idx] = new SQLS(NS, mgr.at.mainPath, cache, conn, (mgr.this[NS][conn.name] = {}), new DBS(dialect, conn));
  mgr.at.connNames[idx] = conn.name;
}

/**
 * Executes one or more {@link SQLS} functions
 * @private
 * @param {Manager} mgr The _internal_/private {@link Manager} store
 * @param {String} funcName The async function name to call on each {@link SQLS} instance
 * @param {SQLEROperationOptions} [opts] The {@link SQLEROperationOptions} to use
 * @param {String[]} [connNames] The connection names to perform the opearion on (defaults to all connections)
 * @returns {SQLEROperationResults} The results
 */
async function operation(mgr, funcName, opts, connNames) {
  opts = opts || {};
  const cnl = (connNames && connNames.length) || 0;
  const ax = new Asynchro({}, opts.returnErrors ? false : true);
  const queue = sqli => {
    const func = () => {
      if (typeof sqli[funcName] === 'function') return sqli[funcName]();
      return Promise.resolve(sqli[funcName]);
    };
    const name = sqli.connectionName;
    const hasConnOpts = opts.connections && opts.connections[name] && typeof opts.connections[name] === 'object';
    const hasSeriesOverride = hasConnOpts && opts.connections[name].hasOwnProperty('executeInSeries');
    const hasErrorOverride = hasConnOpts && opts.connections[name].hasOwnProperty('returnErrors');
    const throws = hasErrorOverride && opts.connections[name].returnErrors ? false : true;
    if (hasSeriesOverride ? opts.connections[name].executeInSeries : opts.executeInSeries) {
      if (hasErrorOverride) ax.seriesThrowOverride(name, throws, func);
      else ax.series(name, func);
    } else {
      if (hasErrorOverride) ax.parallelThrowOverride(name, throws, func);
      else ax.parallel(name, func);
    }
  };
  for (let i = 0, l = mgr.at.sqls.length; i < l; ++i) {
    if (funcName === 'init' && mgr.at.sqls[i].isInitialized && mgr.at.sqls[i].isPrepared) continue;
    if (cnl) {
      if (!connNames.includes(mgr.at.sqls[i].connectionName)) continue;
      queue(mgr.at.sqls[i]);
    } else {
      queue(mgr.at.sqls[i]);
    }
  }
  const result = await ax.run();
  return { result, errors: ax.errors };
}

/**
 * Reads all the perpared SQL definition files for a specified name directory and adds a function to execute the SQL file contents
 * @private
 */
class SQLS {

  /**
   * Reads all the prepared SQL definition files for a specified name directory and adds a function to execute the SQL file contents
   * @constructs SQLS
   * @param {String} ns The namespace on the {@link Manager} where all {@link SQLERPreparedFunction} will be added
   * @param {String} sqlBasePth the absolute path that SQL files will be included
   * @param {SQLERCache} [cache] the {@link SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
   * @param {SQLERConnectionOptions} conn options for the prepared statements
   * @param {Object} db the object where SQL retrieval methods will be stored (by file name parts separated by a period- except the file extension)
   * @param {DBS} dbs the database service to use
   */
  constructor(ns, sqlBasePth, cache, conn, db, dbs) {
    const sqls = internal(this);
    sqls.at.ns = ns;
    sqls.at.numOfPreparedFuncs = 0;
    sqls.at.basePath = Path.join(sqlBasePth, conn.dir || conn.name);
    sqls.at.cache = cache;
    sqls.at.conn = conn;
    sqls.at.subs = conn.substitutes;
    sqls.at.subrxs = conn.substitutes && [];
    sqls.at.dateFormatter = conn.dateFormatter;
    sqls.at.db = db;
    sqls.at.dbs = dbs;
    if (sqls.at.subs) for (let key in sqls.at.subs) {
      sqls.at.subrxs.push({ from: new RegExp(key, 'g'), to: sqls.at.subs[key] }); // turn text value into global regexp
    }
  }

  /**
   * Initializes the SQL paths
   */
  async init() {
    const sqls = internal(this);
    const isPrepared = sqls.at.isPrepared;
    if (!isPrepared) {
      sqls.at.numOfPreparedFuncs = 0;
      const prepare = async (cont, pnm, pdir) => {
        let pth, proms = [];
        try {
          cont = cont || sqls.at.db;
          pdir = pdir || sqls.at.basePath;
          const files = await Fs.promises.readdir(pdir);
          for (let fi = 0, stat, nm, ns, ext; fi < files.length; ++fi) {
            pth = Path.resolve(pdir, files[fi]);
            stat = await Fs.promises.stat(pth);
            if (stat && stat.isDirectory()) {
              nm = files[fi].replace(/[^0-9a-zA-Z]/g, '_');
              proms.push(prepare(cont[nm] = {}, `${pnm ? `${pnm}_` : ''}${nm}`, pth));
              continue;
            }
            if (!files[fi].endsWith('.sql')) continue;
            nm = files[fi].replace(/[^0-9a-zA-Z\.]/g, '_');
            ns = nm.split('.');
            ext = ns.pop();
            nm = `${sqls.at.conn.dialect}_${sqls.at.conn.name}_${pnm ? `${pnm}_` : ''}${ns.join('_')}`;
            for (let ni = 0, nl = ns.length, so = cont; ni < nl; ++ni) {
              if (ns[ni] === 'beginTransaction') throw new Error(`SQL "${fpth}" cannot contain reserved "beginTransaction"`);
              so[ns[ni]] = so[ns[ni]] || (ni < nl - 1 ? {} : await sqls.this.prepared(nm, pth, ext));
              so = so[ns[ni]];
            }
          }
          await Promise.all(proms);
        } catch (err) {
          if (sqls.at.conn.errorLogging) sqls.at.conn.errorLogging(`Failed to build SQL statements from files in directory ${pth || pdir}`, err);
          throw err;
        }
      };
      await prepare();
      sqls.at.db.beginTransaction = opts => sqls.at.dbs.beginTransaction(opts);
      sqls.at.isPrepared = true;
    }
    if (!isPrepared || !sqls.at.initResult) {
      sqls.at.initResult = await sqls.at.dbs.init({ numOfPreparedFuncs: sqls.at.numOfPreparedFuncs });
    }
    return sqls.at.initResult;
  }

  /**
   * Generates a function that will execute a pre-defined SQL statement contained within a SQL file (and handle caching of that file)
   * @protected
   * @param {String} name the name of the SQL (excluding the extension)
   * @param {String} fpth the path to the SQL file to execute
   * @param {String} ext the file extension that will be used
   * @returns {SQLERPreparedFunction} an `async function` that executes SQL statement(s)
   */
  async prepared(name, fpth, ext) {
    const sqls = internal(this);
    if (sqls.at.conn.logging) sqls.at.conn.logging(`Generating prepared function for ${fpth} at name ${name}`);
    let crud = Path.parse(fpth).name.match(/[^\.]*/)[0].toUpperCase();
    if (!CRUD_TYPES.includes(crud)) crud = null;
    if (sqls.at.conn.logging) {
      sqls.at.conn.logging(`Generating prepared function for ${fpth} at name ${name}${
        crud ? '' : ` (statement execution must include "opts.type" set to one of ${CRUD_TYPES.join(',')} since the SQL file path is not prefixed with the type)`}`);
    }
    // cache the SQL statement capture in order to accommodate dynamic file updates on expiration
    sqls.at.stms = sqls.at.stms || { methods: {} };
    sqls.at.stms.methods[name] = {};
    if (sqls.at.cache) {
      const id = `${MOD_KEY}:db:${name}:${ext}`;
      sqls.at.stms.methods[name][ext] = async function cachedSql(opts, execFn) { // execute the SQL statement with cached statements
        let sql;
        const cached = await sqls.at.cache.get(id);
        if (!cached || !cached.item) {
          if (sqls.at.conn.logging) sqls.at.conn.logging(`Refreshing cached ${fpth} at ID ${id}`);
          sql = await readSqlFile();
          sqls.at.cache.set(id, sql); // no need to await set
        } else sql = cached.item;
        return await execFn(sql);
      };
    } else {
      if (sqls.at.conn.logging) sqls.at.conn.logging(`Setting static ${fpth} at "${name}"`);
      const sql = await readSqlFile();
      sqls.at.stms.methods[name][ext] = async function staticSql(opts, execFn) { // execute the SQL statement with static statements
        return await execFn(sql);
      };
    }
    sqls.at.numOfPreparedFuncs++;

    /**
     * @returns {String} the SQL contents from the SQL file
     */
    async function readSqlFile() {
      let data = await Fs.promises.readFile(fpth, { encoding: 'utf8' });
      if (data && sqls.at.subrxs) for (let i = 0, l = sqls.at.subrxs.length; i < l; ++i) {
        data = data.replace(sqls.at.subrxs[i].from, sqls.at.subrxs[i].to); // substitutions
      }
      return data;
      // return ext === 'json' ? JSON.parse(data.toString('utf8').replace(/^\uFEFF/, '')) : data; // when present, replace BOM before parsing JSON result
    }

    /**
    * Sets/formats SQL parameters and executes an SQL statement
    * @see SQLERPreparedFunction
    */
    return async function execSqlPublic(opts, frags, errorOpts) {
      const binds = {}, mopt = { binds, opts: frags }, type = (opts && opts.type && opts.type.toUpperCase()) || crud;
      if (!type || !CRUD_TYPES.includes(type)) {
        throw new Error(`Statement execution at "${fpth}" must include "opts.type" set to one of ${
          CRUD_TYPES.join(',')} since the SQL file name was not prefixed with a valid type (found: ${type})`);
      }
      if (sqls.at.conn.binds) for (let i in sqls.at.conn.binds) {
        if (!opts || !opts.binds || !opts.binds.hasOwnProperty(i)) {
          // add per connection static parameters when not overridden
          if (sqls.at.conn.binds[i] instanceof Date) {
            binds[i] = sqls.this.formatDate(sqls.at.conn.binds[i], (opts && opts.dateFormatter) || sqls.at.dateFormatter);
          } else {
            binds[i] = sqls.at.conn.binds[i]; 
          }
        }
      }
      if (opts && opts.binds) {
        for (let i in opts.binds) {
          if (opts.binds[i] instanceof Date) {
            binds[i] = sqls.this.formatDate(opts.binds[i], opts.dateFormatter || sqls.at.dateFormatter);
          } else {
            binds[i] = opts.binds[i];
          }
        }
      }
      const xopts = {
        name: opts && opts.name,
        type,
        binds,
        autoCommit: opts && opts.hasOwnProperty('autoCommit') ? opts.autoCommit : true
      };
      if (opts && opts.driverOptions) xopts.driverOptions = opts.driverOptions;
      if (opts && opts.prepareStatement) xopts.prepareStatement = !!opts.prepareStatement;
      if (opts && opts.transaction) xopts.transaction = opts.transaction;
      if (!xopts.autoCommit && (!xopts.transaction || !xopts.transaction.id) && !xopts.prepareStatement) {
        throw new Error(`SQL execution at "${fpth}" must include "opts.transaction" when "opts.autoCommit = false" and` +
        ` "opts.prepareStatement = false". Try setting "opts.transaction = await manager.${sqls.at.ns}.${sqls.at.conn.name}.beginTransaction()"`);
      }
      return await sqls.at.stms.methods[name][ext](mopt, sqls.this.genExecSqlFromFileFunction(name, fpth, xopts, frags, errorOpts));
    };
  }

  formatDate(bind, dfunc) {
    if (dfunc === true) {
      return bind.toISOString(); // convert dates to ANSI format for use in SQL
    } else if (dfunc && typeof dfunc === 'function') {
      dfunc = dfunc(bind);
      return typeof dfunc === 'string' ? dfunc : bind;
    } else return bind;
  }

  genExecSqlFromFileFunction(name, fpth, opts, frags, errorOpts) {
    const sqls = internal(this);
    return async function execSqlFromFile(sql) {
      return await sqls.at.dbs.exec(name, fpth, sql, opts, frags, errorOpts);
    };
  }

  /**
   * Iterates through and terminates the different database connection pools
   */
  async close() {
    return internal(this).at.dbs.close();
  }

  /**
   * @returns {SQLERState} The current managed state of the {@link DBS}
   */
  get state() {
    return internal(this).at.dbs.state;
  }

  /**
   * @returns {Integer} the number of prepared statements found in SQL files
   */
  get numOfPreparedFuncs() {
    return internal(this).at.numOfPreparedFuncs;
  }

  /**
   * @returns {String} the connection name associated with the {@link SQLS} instance
   */
  get connectionName() {
    return internal(this).at.conn.name;
  }

  /**
   * @returns {Boolean} True when all of the SQL functions have been prepared
   */
  get isPrepared() {
    return internal(this).at.isPrepared;
  }

  /**
   * @returns {*} Any truthy value that indicates the initialization was successful (or an error when returning errors instead of throwing them)
   */
  get isInitialized() {
    return internal(this).at.initResult;
  }
}

/**
 * Database service
 * @private
 */
class DBS {

  /**
   * Database service constructor
   * @constructs DBS
   * @param {Dialect} dialect the database dialect implementation/executor to use
   * @param {SQLERConnectionOptions} conn the connection options
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
   * @param {SQLERTransactionOptions} [opts={}] The passed transaction options
   * @returns {SQLERTransaction} The transaction that has been started
   */
  async beginTransaction(opts) {
    const dbs = internal(this);
    return dbs.at.dialect.beginTransaction(generateGUID(), opts || {});
  }

  /**
  * Executes SQL using the underlying framework API
  * @param {String} name The name given to the SQL file
  * @param {String} fpth The originating file path where the SQL resides
  * @param {String} sql The SQL to execute with optional substitutions {@link DBS#frag}
  * @param {SQLERExecOptions} opts The eectution options
  * @param {String[]} frags The frament keys within the SQL that will be retained
  * @param {(SQLERExecErrorOptions | Boolean)} [errorOpts] Truthy to return any errors thrown during execution rather than throwing them.
  * Can also pass {@link SQLERExecErrorOptions} for more control over execution errors.
  * @returns {Dialect~ExecResults} The execution results
  */
  async exec(name, fpth, sql, opts, frags, errorOpts) {
    const dbs = internal(this);
    const sqlf = dbs.this.segmentSubs(sql, opts.binds, frags);
    // framework that executes SQL may output SQL, so, we dont want to output it again if logging is on
    if (dbs.at.logging) {
      dbs.at.logging(`Executing SQL ${fpth} with options ${JSON.stringify(opts)}${frags ? ` framents used ${JSON.stringify(frags)}` : ''}`);
    }
    let rslt;
    try {
      const meta = { name, path: fpth };
      rslt = await dbs.at.dialect.exec(sqlf, opts, frags, meta, errorOpts); // execute the prepared SQL statement
    } catch (err) {
      try {
        const eopts = JSON.parse(JSON.stringify(opts));
        eopts.binds = errorOpts && errorOpts.includeBindValues ? eopts.binds : Object.keys(opts.binds);
        if (dbs.at.errorLogging) {
          dbs.at.errorLogging(`SQL ${eopts.name ? `named "${eopts.name}" at ` : ''
          }${fpth} failed ${err.message || JSON.stringify(err)} (options: ${JSON.stringify(eopts)}, state: ${dbs.at.dialect.state})`);
        }
        err[MOD_KEY] = err[MOD_KEY] || {};
        err[MOD_KEY].name = name;
        err[MOD_KEY].file = fpth;
        err[MOD_KEY].sql = sqlf;
        err[MOD_KEY].options = eopts;
        err[MOD_KEY].fragments = frags;
        err.message = `${err.message}\n${JSON.stringify(err[MOD_KEY], null, ' ')}`;
      } catch (frmtErr) {
        if (dbs.at.errorLogging) {
          dbs.at.errorLogging(`Failed to set ${MOD_KEY} error properties for error at SQL: ${fpth}`, frmtErr);
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
      dbs.at.logging(`SQL ${fpth} returned with ${(rslt && rslt.rows && rslt.rows.length) || 0} records (options: ${JSON.stringify(opts)}, state: ${dbs.at.dialect.state})`);
    }
    return rslt;
  }

  /**
  * Replaces or removes tagged substitution segments that appear in an SQL statement
  * - __Expansions__ - Expands _bind_ variables that contain an array of values when they appear in the SQL statement. For example, an SQL statement with a section that contains
  * `IN (:someParam)` and _binds_ of `{ someParam: [1,2,3] }` would become `IN (:someParam, :someParam1, :someParam2)` with _binds_ of `{ someParam: 1, someParam1: 2, SomeParam2: 3 }`
  * - __Dialects__ - Replaces SQL segments that contain an open `[[! myDialectName]]` and closing `[[!]]` with the SQL content that is between the opening and closing _dialect_ tags
  * when the {@link SQLERConnectionOptions} contains the designated _dialect_ name (`myDialectName` in this case). For example, 
  * `[[! oracle]] SOME_COL = SUBSTR(SOME_COL, 1, 1) [[!]] [[! mssql]] SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1) [[!]]`
  * would become `SOME_COL = SUBSTR(SOME_COL, 1, 1)` when using an `oracle` dialect, `SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1)` when using an `mssql` dialect and omitted using any
  * other dialect.
  * - __Versions__ - Replaces SQL segments that contain an open `[[version = 1]]` and closing `[[version]]` with the SQL content that is between the opening and closing _version_ tags
  * when the {@link SQLERConnectionOptions} contains a _version_ that satisfys the comparative operator for the version within the tag designator. For example,
  * `[[version <= 1]] SOME_OLD_COL [[version]] [[version > 1]] SOME_NEW_COL [[version]]` would become `SOME_OLD_COL` using a {@link SQLERConnectionOptions} _version_ that is less than
  * or equal to `1`, but woud become `SOME_NEW_COL` when the _version_ is greater than `1`.
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
   * @returns {SQLERState} The managed state of the {@link Dialect}
   */
  get state() {
    const dbs = internal(this);
    return dbs.at.dialect.state;
  }
}

/**
 * Generate a {@link Manager} _logger_
 * @private
 * @param {Function} log The `function(...args)` that will log out the arguments
 * @param {Sring[]} [tags] The tags that will prefix the log output
 */
function generateLogger(log, tags) {
  return function dbManagerLogger(o) {
    const logs = typeof o === 'string' ? [format.apply(null, arguments)] : arguments;
    for (let i = 0, l = logs.length; i < l; ++i) {
      log(`[${tags ? tags.join() : ''}] ${logs[i]}`);
    }
  };
}

/**
 * Generates formats a GUID formatted identifier
 * @private
 * @param {String} [value] when present, will add any missing hyphens (if `hyphenate=true`) instead of generating a new value
 * @param {Boolean} [hyphenate=true] true to include hyphens in generated result
 * @returns {String} the generated GUID formatted identifier
 */
function generateGUID(value, hyphenate = true) {
  const hyp = hyphenate ? '-' : '';
  if (value) return hyphenate ? value.replace(/(.{8})-?(.{4})-?(.{4})-?(.{4})-?(.{12})/gi, `$1${hyp}$2${hyp}$3${hyp}$4${hyp}$5`) : value;
  return `xxxxxxxx${hyp}xxxx${hyp}4xxx${hyp}yxxx${hyp}xxxxxxxxxxxx`.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * @see SQLERInterpolateFunction
 * @private
 */
function interpolate(dest, source, interpolator, validator, onlyInterpolated, _vpths) {
  let val, typ, vfunc = typeof validator === 'function' && validator, pole = interpolator || dest, isPole;
  for (let srcProp in source) {
    if (!source.hasOwnProperty(srcProp)) continue;
    isPole = false;
    typ = typeof source[srcProp];
    if (typ === 'object' && !(source[srcProp] instanceof Date) && !(source[srcProp] instanceof RegExp)) {
      if (_vpths) _vpths.push(srcProp);
      else if (vfunc) _vpths = [srcProp];
      dest[srcProp] = interpolate(source[srcProp], source[srcProp], interpolator, validator, onlyInterpolated, _vpths);
      if (_vpths) _vpths.shift();
      continue;
    }
    if (typ === 'string') {
      // actual interpolation
      val = undefined;
      source[srcProp].replace(/\${\s*([A-Z_]+)\s*}/i, (match, interpolated) => {
        if (interpolated in pole) {
          isPole = true;
          val = pole[interpolated];
        } else {
          val = match; // leave as is
        }
      });
      if (typeof val === 'undefined') {
        val = source[srcProp];
      }
    } else {
      val = source[srcProp];
    }
    if (vfunc) {
      if (_vpths) _vpths.push(srcProp);
      else _vpths = [srcProp];
      if (!vfunc(_vpths, val)) {
        _vpths.pop();
        continue;
      }
    }
    if (!onlyInterpolated || isPole) dest[srcProp] = val;
    if (_vpths) _vpths.pop();
  }
  return dest;
}

/**
 * @see SQLERPositionalBindsFunction
 * @private
 */
function positionalBinds(sql, bindsObject, bindsArray, placeholder = '?') {
  const func = typeof placeholder === 'function' ? placeholder : null;
  return sql.replace(/(?<!:):(\w+)(?=([^'\\]*(\\.|'([^'\\]*\\.)*[^'\\]*'))*[^']*$)/g, (match, pname) => {
    if (!bindsObject.hasOwnProperty(pname)) throw new Error(`sqler: Unbound "${pname}" at position ${
      bindsArray.length
    } found during positional bind formatting`);
    bindsArray.push(bindsObject[pname]);
    return func ? func(pname, bindsArray.length - 1) : placeholder;
  });
}

module.exports = Object.freeze({ Manager, Dialect });

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

/**
 * The `cache` client responsible for regulating the frequency in which a SQL file is read by a {@link Manager}.
 * @typedef {Object} SQLERCache
 * @property {Function} start An `async function()` that starts caching. This could be a `noop` or could start any background processing and/or capture of cached keys (depending on the type of
 * implementation).
 * @property {Function} stop An `async function()` that stops caching. This could be a `noop` or could stop any background processing and/or capture of cached keys (depending on the type of
 * implementation).
 * @property {Function} get An `async function(key)` that gets a corresponding SQL statement from cache using the specified _key_ to uniquily identify the SQL source (typically generated by a {@link Manager}).
 * The returned _object_ will contain the following values when present (otherwise, returns _null_):
 * - `item` - The cached SQL statement
 * - `stored` - The timestamp indicating the time when the SQL statement was stored in cache
 * - `ttl` - The timestamp indicating the remaining time left before the SQL statement will be removed from cache
 * @property {Function} set An `async function(key sql, ttlOverride)` that sets a SQL statement in cache, overriding the _time-to-live__ (in milliseconds) that may have been set by a {@link Manager}.
 * @property {Function} drop An `async function(key)` that removes the specified key from cache
 * @example
 * // cache options can be different depending on the needs of the implementing cache
 * const cacheOpts = {
 *  "expiresIn": 60000
 * };
 * // simple interval cache for illustration purposes
 * const bank = { store: {}, handles: {} };
 * const cache = {
 *  start: async () => {
 *    let cached, calTtl;
 *    for (let key in bank.handles) {
 *      clearInterval(bank.handles[key]);
 *      cached = bank.store.hasOwnProperty(key) ? bank.store[key] : null;
 *      calTtl = !cached|| isNaN(cached.ttl) ? cacheOpts.expiresIn : cached.ttl;
 *      bank.handles[key] = setInterval(() => delete bank.store[key], calTtl);
 *    }
 *  },
 *  stop: async () => {
 *    for (let key in bank.handles) {
 *      clearInterval(bank.handles[key]);
 *    }
 *  },
 *  get: async key => {
 *    const cached = bank.store.hasOwnProperty(key) ? bank.store[key] : null;
 *    if (cached) cached.ttl = Date.now() - cached.stored;
 *    return Promise.resolve(cached ? JSON.parse(JSON.stringify(cached)) : cached);
 *  },
 *  set: async (key, val, ttl) => {
 *    if (bank.handles[key]) clearInterval(bank.handles[key]);
 *    const calTtl = !ttl || isNaN(ttl) ? cacheOpts.expiresIn : ttl;
 *    bank.store[key] = { item: val, stored: Date.now(), ttl: calTtl };
 *    bank.handles[key] = setInterval(sql => delete bank.store[key], calTtl);
 *    return Promise.resolve();
 *  },
 *  drop: async () => {
 *    if (bank.handles[key]) {
 *      clearInterval(bank.handles[key]);
 *      delete bank.handles[key];
 *    }
 *    if (bank.store[key]) delete bank.store[key];
 *  }
 * };
 * 
 * // manager configuration
 * const conf = {
 *  // other required conf options here
 *  "db": {
 *    "connections": [
 *      {
 *        // other required connection conf options here
 *      }
 *    ]
 *  }
 * };
 * 
 * const mgr = new Manager(conf, cache);
 * await mgr.init();
 * // use the manager to execute SQL files that will
 * // be refreshed/re-read every 60 seconds
 */

/**
 * Private options for global {@link Manager} use
 * @typedef {Object} SQLERPrivateOptions
 * @property {String} [username] The username to connect to the database
 * @property {String} [password] The password to connect to the database
 * @property {String} [host] The host to connect to for the database
 * @property {String} [port] The port to connect to for the database (when not included in the host)
 * @property {String} [protocol] The protocol to use when connecting to the database
 * @property {String} [privatePath] The private path set by an originating {@link Manager} constructor (when not already set) that may be used by an implementing {@link Dialect} for private data use
 * (e.g. `TNS` files, etc.)
 */

/**
 * Configuration options for {@link Manager} use
 * @typedef {Object} SQLERConfigurationOptions
 * @property {String} [mainPath] Root directory starting point to look for SQL files (defaults to `require.main` path or `process.cwd()`)
 * @property {String} [privatePath] Current working directory where generated files will be located (if any, defaults to `process.cwd()`)
 * @property {Boolean} [debug] Truthy to turn on debugging
 * @property {SQLERUniversalOptions} univ The {@link SQLERUniversalOptions}
 * @property {Object} db The _public_ facing database configuration
 * @property {Object} db.dialects An object that contains {@link Dialect} implementation details where each property name matches a dialect name and the value contains either the module class or a string
 * that points to a {@link Dialect} implementation for the given dialect (e.g. `{ dialects: { 'oracle': 'sqler-oracle' } }`). When using a directory path the dialect path will be prefixed with
 * `process.cwd()` before loading.
 * @property {SQLERConnectionOptions[]} db.connections The connections options that will be used.
 */

/**
 * The universal configuration that, for security and sharing purposes, remains external to an application
 * @typedef {Object} SQLERUniversalOptions
 * @property {Object} db The database options that contain _private_ sensitive configuration. Each property should correspond to a {@link SQLERPrivateOptions} instance and the property name should
 * be linked to a {@link SQLERConnectionOptions} `id` within `conf.db.connections`. Each {@link SQLERPrivateOptions} instance will be used to connect to the underlying database
 * (e.g. `{ db: myConnId: { host: "someDbhost.example.com", username: "someUser", password: "somePass" } }`)
 */

/**
* Options for connections used by {@link Manager}
 * @typedef {Object} SQLERConnectionOptions
 * @property {String} id Identifies the connection within a {@link SQLERPrivateOptions}
 * @property {String} dialect The database dialect (e.g. mysql, mssql, oracle, etc.)
 * @property {String} name The name given to the database used as the property name on the {@link Manager} to access generated SQL functions (e.g. `name = 'example'` would result in a SQL function
 * connection container `manager.db.example`). The _name_ will also be used as the _cwd_ relative directory used when no dir is defined
 * @property {String} [dir=name] The alternative dir where `*.sql` files will be found relative to `mainPath` passed into a {@link Manager} constructor. The directory path will be used as the basis
 * for generating SQL statements from discovered SQL files. Each will be made accessible in the manager by name followed by an object for each name separated by period(s)
 * within the file name with the last entry as the executable {@link SQLERPreparedFunction}. For example, a connection named "conn1" and a SQL file named "user.team.details.sql" will be accessible within the manager
 * as "mgr.db.conn1.user.team.details()". But when `dir` is set to "myDir" the SQL files will be loaded from the "myDir" directory (relative to `mainPath`) instead of the default directory that matches the connection
 * name "conn1".
 * @property {Float} [version] A version that can be used for version substitutions within an SQL statement
 * @property {String} [service] The service name defined by the underlying database (may be required depending on the implementing {@link Dialect}
 * @property {Object} [binds] The global object that contains bind variable values that will be included in all SQL calls made under the connection for parameter `binds` if not overridden
 * by individual "binds" passed into the {@link SQLERPreparedFunction}
 * @property {Object} [substitutes] Key/value pairs that define global/static substitutions that will be made in prepared statements by replacing occurances of keys with corresponding values
 * @property {String} [host] The database host override for a value specified in {@link SQLERPrivateOptions}
 * @property {String} [port] The database port override for a value specified in {@link SQLERPrivateOptions}
 * @property {String} [protocol] The database protocol override for a value specified in {@link SQLERPrivateOptions}
 * @property {(Function | Boolean)} [dateFormatter] A `function(date)` that will be used to format bound dates into string values for {@link SQLERPreparedFunction} calls. Set to a truthy value to
 * perform `date.toISOString()`. __Gets overridden by the same option set on {@link SQLERExecOptions}__.
 * @property {Object} [driverOptions] Options passed directly into the {@link Dialect} driver
 * @property {(Boolean | String[])} [log] When _logging_ is turned on for a given {@link Manager}, the specified tags will prefix the log output. Explicity set to `false` to disable
 * connection _log_ level logging even if it is turned on via the {@link Manager}.
 * @property {(Boolean | String[])} [logError] When _logging_ is turned on for a given {@link Manager}, the specified tags will prefix the error log output. Explicity set to `false` to disable
 * connection _error_ level logging even if it is turned on via the {@link Manager}.
 * @property {Object} [pool] The connection pool options (__overrides any `driverOptions` that may pertain the pool__)
 * @property {Integer} [pool.max] The maximum number of connections in the pool. When `pool.min` and `pool.max` are the same, `pool.increment` should typically be set to _zero_.
 * (__overrides any `driverOptions` that may pertain the pool max__)
 * @property {Integer} [pool.min] The minumum number of connections in the pool. When `pool.min` and `pool.max` are the same, `pool.increment` should typically be set to _zero_.
 * (__overrides any `driverOptions` that may pertain the pool min__)
 * @property {Integer} [pool.idle] The maximum time, in milliseconds, that a connection can be idle before being released (__overrides any `driverOptions` that may pertain the pool idle__)
 * @property {Integer} [pool.increment] The number of connections that are opened whenever a connection request exceeds the number of currently open connections.
 *  When `pool.min` and `pool.max` are the same, `pool.increment` should typically be set to _zero_.
 * (__overrides any `driverOptions` that may pertain the pool increment__)
 * @property {Integer} [pool.timeout] The number of milliseconds that a connection request should wait in the queue before the request is terminated
 * (__overrides any `driverOptions` that may pertain the pool timeout__)
 * @property {String} [pool.alias] __When supported__, the alias of this pool in the connection pool cache (__overrides any `driverOptions` that may pertain the pool alias__)
 */

/**
 * Options that are passed to generated {@link SQLERPreparedFunction}
 * @typedef {Object} SQLERExecOptions
 * @property {String} [name] A name to assign to the execution.
 * @property {String} [type] The type of CRUD operation that is being executed (i.e. `CREATE`, `READ`, `UPDATE`, `DELETE`). __Mandatory only when the
 * generated/prepared SQL function was generated from a SQL file that was not prefixed with a valid CRUD type.__
 * @property {Object} [binds={}] The key/value pair of binding parameters that will be bound in the SQL statement.
 * @property {Boolean} [autoCommit=true] Truthy to perform a commits the transaction at the end of the prepared function execution. __NOTE: When falsy the underlying connection will remain open
 * until the returned {@link SQLERExecResults} `commit` or `rollback` is called.__ [See AutoCommit](https://en.wikipedia.org/wiki/Autocommit) for more details.
 * @property {SQLERTransaction} [transaction] A transaction returned from a prior call to `manager.db.myConnectionName.beginTransaction()` that will be used when executing the {@link SQLERPreparedFunction}.
 * The generated `transaction.id` helps to isolate executions to a single open connection in order to prevent inadvertently making changes on database connections used by other transactions that may also
 * be in progress. The transaction is ignored when there is no transaction in progress with the specified `transaction.id`.
 * @property {Boolean} [prepareStatement] Truthy to generate or use an existing prepared statement for the SQL being executed via the {@link SQLERPreparedFunction}.
 * Prepared statements _may_ help optimize SQL that is executed many times across the same connection with similar or different bind values.
 * __Care must be taken not to drain the connection pool since the connection remains open until the SQL executions have completed and `unprepare` has been called on the {@link SQLERExecResults}.__
 * returned from the {@link SQLERPreparedFunction} call.
 * @property {(Function | Boolean)} [dateFormatter] A `function(date)` that will be used to format bound dates into string values for {@link SQLERPreparedFunction} calls. Set to a truthy value to
 * perform `date.toISOString()`. __Overrides the same option set on {@link SQLERConnectionOptions}__.
 * @property {Object} [driverOptions] Options that may override the {@link SQLERConnectionOptions} for `driverOptions` that may be passed into the {@link Manager} constructor
 */
 // TODO : @property {String} [locale] The [BCP 47 language tag](https://tools.ietf.org/html/bcp47) locale that will be used for formatting dates contained in the `opts` bind variable values (when present)

/**
 * Internally generated metadata that is passed into {@link Dialect.exec} by a {@link Manager} for determining SQL sources.
 * @typedef {Object} SQLERExecMeta
 * @property {String} name The composed name given to a given SQL file
 * @property {String} path The path to the SQL file
 */

/**
 * Options for handling any errors that occur during execution.
 * @typedef {Object} SQLERExecErrorOptions
 * @property {Function} [handler] A `function(error)` that will handle any errors thrown. The errors should contain a `sqler` property containing
 * @property {Boolean} [includeBindValues] Truthy to include the bind parameter values `error.sqler`.
 * @property {Boolean} [returnErrors] Truthy to return any errors that may occur. Otherwise, throw any errors that may occur.
 */

/**
 * Prepared functions are auto-generated `async` functions that execute an SQL statement from an SQL file source.
 * @async
 * @callback {Function} SQLERPreparedFunction
 * @param {SQLERExecOptions} [opts] The SQL execution options
 * @param {String[]} [frags] Consists of any fragment segment names present in the SQL being executed that will be included in the final SQL statement. Any fragments present
 * in the SQL source will be excluded from the final SQL statement when there is no matching fragment name.
 * @param {(SQLERExecErrorOptions | Boolean)} [errorOpts] Either the error handling options or a boolean flag indicating that any errors that occur during execution should be returned in
 * the {@link SQLERExecResults} rather then being thrown.
 * @returns {SQLERExecResults} The execution results
 */

/**
 * Results returned from invoking a {@link SQLERPreparedFunction}.
 * __NOTE: Either `transaction.commit` or `trnasaction.rollback` must be invoked when `autoCommit` is _falsy_ and a valid `transaction` is supplied to ensue underlying connections are
 * completed and closed.__
 * @typedef {Object} SQLERExecResults
 * @property {Object[]} [rows] The execution array of model objects representing each row or `undefined` when executing a non-read SQL statement.
 * @property {Function} [unprepare] A no-argument _async_ function that unprepares an outstanding prepared statement. Will not be available when the {@link SQLERPreparedFunction} is called
 * when the specified `prepareStatement` is _falsy_ on the {@link SQLERExecOptions} passed into the {@link SQLERPreparedFunction}. When a prepared statement is used in conjunction with a
 * {@link SQLERTransaction} `transaction` on the {@link SQLERExecOptions}, `unprepare` will be implicitly called when `transaction.commit` or `transaction.rollback` are called (of course,
 * `unprepare` can still be explicitly called as well).
 * __NOTE: A call to `unprepare` must be invoked when a `prepareStatement` is _truthy_ to ensue underlying statements and/or connections are completed and closed.__
 * @property {Error} [error] Any caught error that occurred when a {@link SQLERPreparedFunction} was invoked with the `errorOpts` flag set to a _truthy_ value.
 * @property {Object} raw The raw results from the execution (driver-specific execution results).
 */

/**
 * Transaction that symbolizes a unit of work performed within a {@link Manager} connection.
 * @typedef {Object} SQLERTransaction
 * @property {String} id The unique identifier for the transaction.
 * @property {Function} commit A no-argument _async_ function that commits the outstanding transaction.
 * @property {Function} rollback A no-argument _async_ function that rollbacks the outstanding transaction.
 * @property {Object} state The state of the transaction
 * @property {Boolean} state.isCommitted True when the transaction has been committed.
 * @property {Boolean} state.isRolledback True when the transaction has been rolledback.
 * @property {Integer} state.pending The number of pending SQL statements executed within the scope of the given transaction.
 */

/**
 * Options for a {@link SQLERTransaction} that can be passed into a `manager.connectionName.beginTransaction(transactionDriverOptions)` function.
 * @typedef {Object} SQLERTransactionOptions
 */

/**
 * Options for operational methods on a {@link Manager} (e.g. {@link Manager.init}, {@link Manager.state}, {@link Manager.close}, etc.).
 * @typedef {Object} SQLEROperationOptions
 * @property {Object} [connections] An object that contains connection names as properties. Each optionally containing an object with `errorOpts` and/or `executeInSeries`
 * that will override any global options set directly on the {@link SQLEROperationOptions}. For example, `opts.connections.myConnection.executeInseries` would override
 * `opts.executeInSeries` for the connection named `myConnection`, but would use `opts.executeInSeries` for any other connections that ae not overridden.
 * @property {Boolean} [executeInSeries] Set to truthy to execute the operation in series, otherwise executes operation in parallel.
 * @property {(SQLERExecErrorOptions | Boolean)} [errorOpts] Set to truthy to return any errors. Otherise throw any errors as they are encountered. options can also be set instead.
 */

/**
 * Results returned from invoking an operational method on a {@link Manager} (e.g. {@link Manager.init}, {@link Manager.state}, {@link Manager.close}, etc.).
 * @typedef {Object} SQLEROperationResults
 * @property {Object} result An object that contains a property name that matches each connection that was processed (the property value is the number of operations processed per connection).
 * @property {Error[]} errors Any errors that may have occurred on the operational methods. Should only be populated when {@link SQLEROperationOptions} are used with a truthy value set on
 * `errorOpts`. Each will contain meta properties set by [Asynchro](https://ugate.github.io/asynchro).
 */

/**
 * Options that are used during initialization
 * @typedef {Object} SQLERInitOptions
 * @property {Integer} numOfPreparedFuncs The total number of {@link SQLERPreparedFunction}(s) registered on the {@link Dialect}
 */

/**
 * The current state of the managed {@link Dialect}
 * @typedef {Object} SQLERState
 * @property {Integer} pending The number of transactions that are pending `commit` or `roolback` plus any prepared statements that are pending
 * `unprepare`.
 * @property {Object} [connections] The connection state
 * @property {Integer} [connections.count] The number of connections
 * @property {Integer} [connections.inUse] The number of connections that are in use
 */

/**
 * A validation for validating interpolation used by a {@link SQLERInterpolateFunction}
 * @callback {Function} SQLERInterpolateValidationFunction
 * @param {String[]} srcPropNames Property path(s) to the value being validated (e.g. `source.my.path = 123` would equate to 
 * a invocation to `validator(['my','path'], 123)`).
 * @param {*} srcPropValue The value being validated for interpolation
 * @returns {Boolean} Flag indicating whether or not to include the interpolated property/value
 */

/**
 * Interpolates values from a _source_ object to a _destination_ object.
 * When a value is a string surrounded by `${}`, it will be assumed to be a interpolated property that resides on _another_ property on the `source`
 * or an interpolated property on the `interpolator`.
 * For example `source.someProp = '${SOME_VALUE}'` will be interpreted as `dest.someProp = dest.SOME_VALUE` when the `interpolator` is omitted and
 * `dest.someProp = interpolator.SOME_VALUE` when an `interpolator` is specified.
 * __Typically only used by implementing {@link Dialect} constructors within a {@link SQLERTrack}.__
 * @callback {Function} SQLERInterpolateFunction
 * @param {Object} dest The destination where the sources will be set (also the interpolated source when `interpolator` is omitted).
 * @param {Object} source The source of the values to interpolate (e.g. {@link SQLERConnectionOptions}, {@link SQLERExecOptions}, etc.).
 * @param {Object} [interpolator=dest] An alternative source to use for extracting interpolated values from.
 * @param {SQLERInterpolateValidationFunction} [validator] A validation function for each property/value being interpolated to determine
 * if it will be interolated.
 * @param {Boolean} [onlyInterpolated] Truthy to indicate that the only values that will be set from the `source`/`interpolator` will be values that
 * have been interpolated. __NOTE: Truthy values will not prevent `source`/`interpolator` objects from getting set on `dest`, just non-interpoalted
 * property values will be skipped__ (i.e. property values that do not contain `${}` interpolation designations).
 * @returns {Object} The passed destination
 */

/**
 * Converts a SQL statement that contains named bind parameters into a SQL statement that contains unnamed/positional bind parameters (using `?`).
 * Each bound parameter is pushed to the array in the position that corresponds to the position within the SQL statement.
 * @callback {Function} SQLERPositionalBindsFunction
 * @param {String} sql The SQL statement that contains the bind parameters
 * @param {Object} bindsObject An object that contains the bind parameters as property names/values
 * @param {Array} bindsArray The array that will be populated with the bind parameters
 * @param {(String | Function)} [placeholder=?] Either a string value that will be used for the postional placeholder or a `function(name, index)` that
 * returns a value that will be used as the positional placeholder.
 * @returns {String} The converted SQL statement
 * @throws {Error} Thrown when a bound parameter is not within the orgiginating SQL statement
 */

/**
 * A tracking mechanism that is shared between all {@link Dialect} implementations for a given {@link Manager}. A track provides a means to share
 * data, etc. from one {@link Dialect} to another. Properties can also be _added_ by a {@link Dialect} for use in other {@link Dialect}s.
 * __Typically only used by implementing {@link Dialect} constructors.__
 * @typedef {Object} SQLERTrack
 * @property {SQLERInterpolateFunction} interpolate An interpolation function that can be used by {@link Dialect} implementations to interpolate
 * configuration option values from underlying drivers within a {@link Dialect} (immutable). The convenience of doing so negates the need for an
 * application that uses a {@link Manager} to import/require a database driver just to access driver constants, etc.
 * @property {SQLERPositionalBindsFunction} positionalBinds A function that will convert an SQL statement with named binds into positional binds
 */