'use strict';

const Dialect = require('./lib/dialect');

const Fs = require('fs');
const { promisify, format } = require('util');
const readdir = promisify(Fs.readdir);
const readFile = promisify(Fs.readFile);
const Path = require('path');
const compare = Object.freeze({
  '=': function eq(x, y) { return x === y; },
  '<': function lt(x, y) { return x < y; },
  '>': function gt(x, y) { return x > y; },
  '<=': function lteq(x, y) { return x <= y; },
  '>=': function gteq(x, y) { return x >= y; },
  '<>': function noteq(x, y) { return x !== y; }
});

/**
 * The `cache` client responsible for regulating the frequency in which a SQL file is read by a {@link Manager}.
 * @typedef {Object} Cache
 * @property {Function} get An `async function(key)` that gets a corresponding SQL statement from cache using the specified _key_ to uniquily identify the SQL source (typically generated by a {@link Manager}).
 * The returned _object_ will contain the following values when present (otherwise, returns _null_):
 * - `item` - The cached SQL statement
 * - `stored` - The timestamp indicating the time when the SQL statement was stored in cache
 * - `ttl` - The timestamp indicating the remaining time left before the SQL statement will be removed from cache
 * @property {Function} set An `async function(key sql, ttlOverride)` that sets a SQL statement in cache, overriding the _time-to-live__ (in milliseconds) that may have been set by a {@link Manager}.
 * @example
 * // cache options can be different depending on the implementing cache
 * const cacheOpts = {
 *  "expiresIn": 60000
 * };
 * // simple interval cache for illustration purposes
 * const bank = { store: {}, handles: {} };
 * const cache = {
 *  get: key => {
 *    const cached = bank.store.hasOwnProperty(key) ? bank.store[key] : null;
 *    if (cached) cached.ttl = Date.now() - cached.stored;
 *    return Promise.resolve(cached ? JSON.parse(JSON.stringify(cached)) : cached);
 *  },
 *  set: (key, val, ttl) => {
 *    if (bank.handles[key]) clearInterval(bank.handles[key]);
 *    const calTtl = !ttl || isNaN(ttl) ? cacheOpts.expiresIn : ttl;
 *    bank.store[key] = { item: val, stored: Date.now(), ttl: calTtl };
 *    bank.handles[key] = setInterval(sql => delete bank.store[key], calTtl);
 *    return Promise.resolve();
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
 * The database(s) manager entry point that autogenerates/manages SQL execution functions from underlying SQL statement files.
 * Vendor-specific implementations should implement {@link Dialect} and pass the class or module path into the constructor as `conf.db.dialects.myDialectClassOrModulePath`.
 * See [README.md](index.html) for more details about SQL related features.
 */
class Manager {

  /**
  * Creates a new database manager. Vendor-specific implementations should have constructors that accept properties defined by {@link Dialect}.
  * @param {Object} conf the configuration
  * @param {String} [conf.mainPath=require.main] root directory starting point to look for SQL files (defaults to `require.main` path or `process.cwd()`)
  * @param {String} [conf.privatePath=process.cwd()] current working directory where generated files will be located (if any)
  * @param {Object} conf.univ the universal configuration that, for security and sharing puposes, remains external to an application
  * @param {Object} conf.univ.db the database configuration that contains connection ID objects that match the connection IDs of each of the conf.db.connections - each connection object should contain a
  * "host", "username" and "password" property that will be used to connect to the underlying database (e.g. { db: myConnId: { host: "someDbhost.example.com", username: 'someUser', password: 'somePass' } })
  * @param {Object} conf.db the database configuration
  * @param {Object} conf.dialects an object that contains dialect implementation details where each property name matches a dialect name and the value contains either the module class or a string that points to the
  * a {@link Dialect} implementation for the given dialect (e.g. `{ dialects: { 'oracle': 'sqler-oracle' } }`)
  * @param {Object[]} conf.db.connections the connections that will be configured
  * @param {String} conf.db.connections[].id identifies the connection within the passed `conf.univ.db`
  * @param {String} conf.db.connections[].name the name given to the database used as the property name on the {@link Manager} to access generated SQL functions (e.g. `name = 'example'` would result in a SQL function
  * connection container `manager.example`). The _name_ will also be used as the _cwd_ relative directory used when no dir is defined
  * @param {String} [conf.db.connections[].dir=connection.name] the alternative dir where `*.sql` files will be found relative to `mainPath`. The directory path will be used as the basis for generating SQL statements
  * from discovered SQL files. Each will be made accessible in the manager by name followed by an object for each name separated by period(s)
  * within the file name with the last entry as the executable `async function(params, locale, frags)`. The function executes the SQL where "params" is the Object that contains the parameter replacements that will be matched
  * within the SQL, the "locale" String representing the locale that will be used for date parameter replacements and "frags" is an optional String[] of (see replacements section for more details). For example, a connection
  * named "conn1" and a SQL file named "user.team.details.sql" will be accessible within the manager as "db.conn1.user.team.details(params, locale, frags, cb)". But when `dir` is set to "myDir" the SQL files will be loaded
  * from the "myDir" directory (relative to `mainPath`) instead of the default directory that matches the connection name "conn1".
  * @param {Float} [conf.db.connections[].version] a version that can be used for replacement selection within the SQL (see replacements section for more details)
  * @param {String} [conf.db.connections[].service] the service name defined by the underlying database (must define if SID is not defined)
  * @param {String} [conf.db.connections[].sid] the SID defined by the underlying database (use only when supported, but service is preferred)
  * @param {Object} [conf.db.connections[].params] global object that contains parameter values that will be included in all SQL calls made under the connection for parameter replacements if not overridden
  * by individual "params" passed into the SQL function
  * @param {Object} [conf.db.connections[].preparedSql] the object that contains options for prepared SQL
  * @param {Object} [conf.db.connections[].preparedSql.substitutes] key/value pairs that define global/static substitutions that will be made in prepared statements by replacing occurances of keys with corresponding values
  * @param {Object} conf.db.connections[].sql the object that contains the SQL connection options (excluding username/password)
  * @param {String} [conf.db.connections[].sql.host] the database host override from conf.univ.db
  * @param {String} conf.db.connections[].sql.dialect the database dialect (e.g. mysql, mssql, oracle, etc.)
  * @param {Object} [conf.db.connections[].sql.dialectOptions] options for the specified dialect passed directly into the {@link Dialect} driver
  * @param {Object} [conf.db.connections[].sql.pool] the connection pool options
  * @param {Integer} [conf.db.connections[].sql.pool.max] the maximum number of connections in the pool
  * @param {Integer} [conf.db.connections[].sql.pool.min] the minumum number of connections in the pool
  * @param {Integer} [conf.db.connections[].sql.pool.idle] the maximum time, in milliseconds, that a connection can be idle before being released
  * @param {String[]} [conf.db.connections[].log] additional logging parameters passed to the `infoLogger`/`errorLogger` function log activity (will also append additional names that identify the connection)
  * @param {Cache} [cache] the {@link Cache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
  * @param {(Function | Boolean)} [logging] the `function(dbNames)` that will return a name/dialect specific `function(obj1OrMsg [, obj2OrSubst1, ..., obj2OrSubstN]))` that will handle database logging
  * (pass `true` to use the console)
  */
  constructor(conf, cache, logging) {
    if (!conf) throw new Error('Database configuration is required');
    if (!conf.db.dialects) throw new Error('Database configuration.dialects are required');
    const db = internal(this), connCnt = conf.db.connections.length, mainPath = conf.mainPath || (require.main && require.main.filename.replace(/([^\\\/]*)$/, '')) || process.cwd();
    const privatePath = conf.privatePath || process.cwd();
    db.at.sqls = new Array(connCnt);
    db.at.logError = logging === true ? generateLogger(console.error, ['db','error']) : (logging && logging(['db','error'])) || console.error;
    db.at.log = logging === true ? generateLogger(console.log, ['db']) : (logging && logging(['db'])) || console.log;
    const reserved = Object.getOwnPropertyNames(Manager.prototype);
    for (let i = 0, conn, def, dbx, dlct, track = {}; i < connCnt; ++i) {
      conn = conf.db.connections[i];
      if (!conn.id) throw new Error(`Connection at index ${i} must have and "id"`);
      def = conf.univ.db[conn.id]; // pull host/credentials from external conf resource
      if (!def) throw new Error(`Connection at index ${i} has invalid "id": ${conn.id}`);
      conn.sql.host = conn.sql.host || def.host;
      dlct = conn.sql.dialect.toLowerCase();
      if (!conf.db.dialects.hasOwnProperty(dlct)) {
        throw new Error(`Database configuration.db.dialects does not contain an implementation definition/module for ${dlct} at connection index ${i}/ID ${conn.id} for host ${conn.sql.host}`);
      }
      if (typeof conf.db.dialects[dlct] === 'string') conf.db.dialects[dlct] = require(conf.db.dialects[dlct]);
      //if (!(conf.db.dialects[dlct] instanceof Dialect)) throw new Error(`Database dialect for ${dlct} is not an instance of a sqler "${Dialect.constructor.name}" at connection index ${i}/ID ${conn.id} for host ${conn.sql.host}`);
      if (conn.sql.log !== false && !conn.sql.log) conn.sql.log = [];
      if (conn.sql.logError !== false && !conn.sql.logError) conn.sql.logError = [];
      if (conn.sql.log !== false) {
        let ltags = [...conn.sql.log, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
        conn.sql.logging = logging === true ? generateLogger(console.log, ltags) : logging && logging(ltags); // override dbx non-error logging
      }
      if (conn.sql.logError !== false) {
        let ltags = [...conn.sql.logError, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
        conn.sql.errorLogging = logging === true ? generateLogger(console.error, ltags) : logging && logging(ltags); // override dbx error logging
      }
      dbx = new conf.db.dialects[dlct](def.username, def.password, conn.sql, conn.service, conn.sid, privatePath, track, conn.sql.errorLogging, conn.sql.logging, conf.debug);
      /*if (dlct === 'oracle') {
        dbx = new OracleDB(def.username, def.password, conn.sql, conn.service, conn.sid, privatePath, track, conn.sql.errorLogging, conn.sql.logging, conf.debug);
      } else if (dlct === 'mssql') {
        dbx = new MSSQLDB(def.username, def.password, conn.sql, conn.service || conn.sid, conn.sql.errorLogging, conn.sql.logging, conf.debug);
        //dbx = new Sequelize(conn.service || conn.sid, def.username, def.password, conn.sql);
        //if (!dbx.init) dbx.init = function sequelizeInit(opts, scb) { // needed for dialect to fulfill Manager interface contract
        //  if (scb) setImmediate(scb);
        //};
      } else throw new Error(`Unsupported database dialect for ${dlct} at connection index ${i}/ID ${conn.id} for host ${conn.sql.host}`);
      */
      // prepared SQL functions from file(s) that reside under the defined name and dialect (or "default" when dialect is flagged accordingly)
      if (db.this[conn.name]) throw new Error(`Database connection ID ${conn.id} cannot have a duplicate name for ${conn.name}`);
      if (reserved.includes(conn.name)) throw new Error(`Database connection name ${conn.name} for ID ${conn.id} cannot be one of the following reserved names: ${reserved}`);
      db.at.sqls[i] = new SQLS(mainPath, cache, conn.preparedSql, (db.this[conn.name] = {}), new DBS(dbx, conf, conn), conn);
    }
  }

  /**
   * Initializes the defined database connections
   * @returns {Integer} the database count of all the connections/pools that are ready for use
   */
  async init() {
    const db = internal(this);
    if (db.at.sqlsCount) throw new Error(`${db.at.sqlsCount} database(s) already initialized`);
    var ccnt = 0, promises = new Array(db.at.sqls.length);
    for (let i = 0, il = db.at.sqls.length; i < il; ++i) promises[i] = db.at.sqls[i].init(); // run initializations in parallel
    try {
      for (let promise of promises) ((await promise) && ++ccnt);
    } catch (err) {
      db.at.logError(err);
      throw err;
    }
    db.at.sqlsCount = ccnt;
    db.at.log(`${ccnt} database(s) are ready for use`);
    return ccnt;
  }

  /**
   * Closes all database pools/connections/etc.
   */
  async close() {
    const db = internal(this), prms = new Array(db.at.sqls.length);
    for (let i = 0, l = db.at.sqls.length; i < l; ++i) prms[i] = db.at.sqls[i].close(); // call close in parallel
    for (let i = 0, l = prms.length; i < l; ++i) await prms[i]; // wait for promises
  }
}

/**
 * Reads all the perpared SQL definition files for a specified name directory and adds a function to execute the SQL file contents
 * @private
 */
class SQLS {

  /**
   * Reads all the prepared SQL definition files for a specified name directory and adds a function to execute the SQL file contents
   * @constructs SQLS
   * @param {String} sqlBasePth the absolute path that SQL files will be included
   *  @param {Cache} [cache] the {@link Cache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
   * @param {Object} psopts options for prepared statements
   * @param {Object} psopts.substitutes key/value pairs that define global/static substitutions that will be made in prepared statements by replacing occurances of keys with corresponding values
   * @param {Object} db the object where SQL retrieval methods will be stored (by file name parts separated by a period- except the file extension)
   * @param {DBS} dbs the database service to use
   * @param {Object} conn the connection configuration
   */
  constructor(sqlBasePth, cache, psopts, db, dbs, conn) {
    if (!conn.name) throw new Error(`Connection ${conn.id} must have a name`);

    const sqls = internal(this);
    sqls.at.basePath = Path.join(sqlBasePth, conn.dir || conn.name);
    sqls.at.cache = cache;
    sqls.at.subs = psopts && psopts.substitutes;
    sqls.at.subrxs = sqls.at.subs && [];
    sqls.at.db = db;
    sqls.at.dbs = dbs;
    sqls.at.conn = conn;
    if (sqls.at.subs) for (let key in sqls.at.subs) sqls.at.subrxs.push({ from: new RegExp(key, 'g'), to: sqls.at.subs[key] }); // turn text value into global regexp
  }

  /**
   * Initializes the SQL paths
   */
  async init() {
    const sqls = internal(this);
    try {
      const files = await readdir(sqls.at.basePath);
      sqls.at.numOfPreparedStmts = files.length;
      for (let fi = 0, nm, ns, ext, jso; fi < sqls.at.numOfPreparedStmts; ++fi) {
        ns = files[fi].split('.');
        ext = ns.pop();
        nm = 'sql_' + sqls.at.conn.name + '_' + sqls.at.conn.sql.dialect + '_' + ns.join('_');
        for (var ni = 0, nl = ns.length, so = sqls.at.db; ni < nl; ++ni) {
          so[ns[ni]] = so[ns[ni]] || (ni < nl - 1 ? {} : await sqls.this.prepared(nm, Path.join(sqls.at.basePath, files[fi]), ext));
          so = so[ns[ni]];
        }
      }
      return await sqls.at.dbs.init({ numOfPreparedStmts: sqls.at.numOfPreparedStmts });
    } catch (err) {
      if (sqls.at.conn.sql.erroLogging) sqls.at.conn.sql.erroLogging(`Failed to build SQL statements from files in directory ${sqls.at.basePath}`, err);
      throw err;
    }
  }

  /**
   * Generates a function that will execute a pre-defined SQL statement contained within a SQL file (and handle caching of that file)
   * @param {String} name the name of the SQL (excluding the extension)
   * @param {String} fpth the path to the SQL file to execute
   * @param {String} ext the file extension that will be used
   * @returns {function} an `async function` that executes SQL statement(s)
   */
  async prepared(name, fpth, ext) {
    const sqls = internal(this);
    // cache the SQL statement capture in order to accommodate dynamic file updates on expiration
    sqls.at.stms = sqls.at.stms || { methods: {} };
    sqls.at.stms.methods[name] = {};
    if (sqls.at.cache) {
      const id = `${name}:${ext}`;
      sqls.at.stms.methods[name][ext] = async function cachedSql(opts, execFn) { // execute the SQL statement with cached statements
        let sql;
        const cached = await sqls.at.cache.get(id);
        if (!cached || !cached.item) {
          if (sqls.at.conn.sql.logging) sqls.at.conn.sql.logging(`Refreshing cached ${fpth} at ID ${id}`);
          sql = await readSqlFile();
          sqls.at.cache.set(id, sql); // no need to await set
        } else sql = cached.item;
        return await execFn(sql);
      };
    } else {
      if (sqls.at.conn.sql.logging) sqls.at.conn.sql.logging(`Setting static ${fpth} at "${name}"`);
      const sql = await readSqlFile();
      sqls.at.stms.methods[name][ext] = async function staticSql(opts, execFn) { // execute the SQL statement with static statements
        return await execFn(sql);
      };
    }

    /**
     * @returns {String} the SQL contents from the SQL file
     */
    async function readSqlFile() {
      var data = await readFile(fpth, { encoding: 'utf8' });
      if (data && sqls.at.subrxs) for (let i = 0, l = sqls.at.subrxs.length; i < l; ++i) data = data.replace(sqls.at.subrxs[i].from, sqls.at.subrxs[i].to); // substitutions
      const dt = ext === 'json' ? JSON.parse(data.toString('utf8').replace(/^\uFEFF/, '')) : data; // when present, replace BOM before parsing JSON result
      return dt || data;
    }

    /**
    * Sets/formats SQL parameters and executes an SQL statement
    * @param {Object} params the parameter names/values to pass into the SQL
    * @param {String} [locale] the locale that will be used for date formatting
    * @param {Object} [frags] the SQL fragments being used (if any)
    * @param {Boolean} [ctch] `true` to catch and return errors instead of throwing them
    */
    return async function execSqlPublic(params, locale, frags, ctch) {
      params = params || {};
      var mopt = { params: params, opts: frags };
      if (sqls.at.conn.params) for (var i in sqls.at.conn.params) {
        if (typeof params[i] === 'undefined') params[i] = sqls.at.conn.params[i]; // add per connection static parameters when not overridden
      }
      if (params && locale) for (var i in params) params[i] = (params[i] instanceof Date && params[i].toISOString()) || params[i]; // convert dates to ANSI format for use in SQL
      return await sqls.at.stms.methods[name][ext](mopt, sqls.this.genExecSqlFromFileFunction(fpth, params, frags, {}, ctch));
    };
  }

  genExecSqlFromFileFunction(fpth, params, frags, jopt, ctch) {
    const sqls = internal(this);
    return async function execSqlFromFile(sql) {
      var qopt = { query: jopt.query || {}, replacements: params };
      return await sqls.at.dbs.exec(fpth, sql, qopt, frags, ctch);
    };
  }

  /**
   * Iterates through and terminates the different database connection pools
   */
  async close() {
    return await internal(this).at.dbs.close();
  }

  /**
   * @returns {Integer} the number of prepared statements found in SQL files
   */
  get numOfPreparedStmts() {
    return internal(this).at.numOfPreparedStmts || 0;
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
   * @param {Object} dbx the database service implementation/executor to use
   * @param {Object} conf the application configuration profile
   * @param {Object} [conn] the connection configuration
   */
  constructor(dbx, conf, conn) {
    const dbs = internal(this);
    dbs.at.dbx = dbx;
    dbs.at.conf = conf;
    dbs.at.conn = conn;
    dbs.at.errorLogging = conn.sql.errorLogging;
    dbs.at.logging = conn.sql.logging;
    dbs.at.dialect = conn.sql.dialect.toLowerCase();
    dbs.at.version = conn.version || 0;
  }

  /**
   * Initializes the database service
   * @param {Object} [opts] initializing options passed into the underlying database implementation/executor
   * @returns {Object} the connection pool
   */
  async init(opts) {
    const dbs = internal(this);
    return await dbs.at.dbx.init(opts);
  }

  /**
  * Executes SQL using the underlying framework API
  * @param {String} fpth the originating file path where the SQL resides
  * @param {String} sql the SQL to execute with optional fragment definitions {@link DBS#frag}
  * @param {Object} opts the options passed to the SQL API
  * @param {String[]} frags the frament keys within the SQL that will be retained
  * @param {Boolean} [ctch] `true` to catch and return errors instead of throwing them
  * @returns {Object[] | Error} the execution results or an error when `ctch` is true
  */
  async exec(fpth, sql, opts, frags, ctch) {
    const dbs = internal(this);
    const sqlf = dbs.this.frag(sql, frags, opts.replacements);
    opts.type = opts.type || (dbs.at.dbx.QueryTypes && dbs.at.dbx.QueryTypes.SELECT) || 'SELECT';
    // framework that executes SQL may output SQL, so, we dont want to output it again if logging is on
    if (dbs.at.logging) {
      dbs.at.logging(`Executing SQL ${fpth}${opts && opts.replacements ? ` with replacements ${JSON.stringify(opts.replacements)}` : ''}${frags ? ` framents used ${JSON.stringify(frags)}` : ''}`);
    }
    var rslt;
    try {
      rslt = await dbs.at.dbx.exec(sqlf, opts, frags); // execute the prepared SQL statement
    } catch (err) {
      if (dbs.at.errorLogging) {
        dbs.at.errorLogging(`SQL ${fpth} failed ${err.message || JSON.stringify(err)} (connections: ${dbs.at.dbx.lastConnectionCount || 'N/A'}, in use: ${dbs.at.dbx.lastConnectionInUseCount || 'N/A'})`);
      }
      if (ctch) return err;
      else throw err;
    }
    if (dbs.at.logging) {
      dbs.at.logging(`SQL ${fpth} returned with ${(rslt && rslt.length) || 0} records (connections: ${dbs.at.dbx.lastConnectionCount || 'N/A'}, in use: ${dbs.at.dbx.lastConnectionInUseCount || 'N/A'})`);
    }
    return rslt;
  }

  /**
  * Removes any SQL fragments that are wrapped around [[? someKey]] and [[?]] when the specified keys does not contain the discovered key (same for dialect and version keys)
  * Replaces any SQL parameters that are wrapped around :someParam with the indexed parameter names (i.e. :someParam :someParam1 ...) and adds the replacement value to the supplied replacements
  * @param {String} sql the SQL to defragement
  * @param {String[]} [keys] fragment keys which will remain intact within the SQL
  * @param {Object} [rplmts] an object that contains the SQL parameterized replacements that will be used for parameterized array composition
  * @returns {String} the defragmented SQL
  */
  frag(sql, keys, rplmts) {
    if (!sql) return sql;
    const dbs = internal(this);

    sql = sql.replace(/(:)([a-z]+[0-9]*?)/gi, function sqlArrayRpl(match, pkey, key) {
      for (var i = 0, vals = key && rplmts && Array.isArray(rplmts[key]) && rplmts[key], keys = '', l = vals && vals.length; i < l; ++i) {
        keys += ((keys && ', ') || '') + pkey + key + (i || '');
        rplmts[key + (i || '')] = vals[i];
      }
      return keys || (pkey + key);
    });
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[\!(?!\[\[\!)\s*(\w+)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[\!\]\]((?:\r?\n|\n)*)/g, function sqlDiaRpl(match, lb1, key, fsql, lb2) {
      return (key && key.toLowerCase() === dbs.at.dialect && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[version(?!\[\[version)\s*(=|<=?|>=?|<>)\s*[+-]?(\d+\.?\d*)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[version\]\]((?:\r?\n|\n)*)/gi, function sqlVerRpl(match, lb1, key, ver, fsql, lb2) {
      return (key && ver && !isNaN(ver = parseFloat(ver)) && compare[key](dbs.at.version, ver) && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    return sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[\?(?!\[\[\?)\s*(\w+)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[\?\]\]((?:\r?\n|\n)*)/g, function sqlFragRpl(match, lb1, key, fsql, lb2) {
      return (key && keys && keys.indexOf(key) >= 0 && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
  }

  /**
   * Iterates through and terminates the different database connection pools
   */
  async close() {
    return await internal(this).at.dbx.close();
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

module.exports = Object.freeze({ Manager, Dialect });

// private mapping
let map = new WeakMap();
let internal = function(object) {
  if (!map.has(object)) {
    map.set(object, {});
  }
  return {
    at: map.get(object),
    this: object
  };
};