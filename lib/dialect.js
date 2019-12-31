'use strict';

/**
 * Options that are passed to the {@link Dialect.init} function
 * @typedef {Object} Dialect~DialectInitOptions
 * @property {Integer} numOfPreparedStmts The total number of prepared statements registered to the {@link Dialect}
 */

/**
 * Options that contain transactional state of a {@link Dialect}
 * @typedef {Object} Dialect~DialectTxOptions
 * @property {Integer} pending The number of pending transactions in progress on the connection
 */

/**
 * Options that are passed to _all_ {@link Dialect} functions
 * @typedef {Object} Dialect~DialectOptions
 * @property {Dialect~DialectTxOptions} tx Transactional state of the {@link Dialect}
 */

 /**
  * Options that are passed to the {@link Dialect.exec} function
  * @typedef {Manager~ExecOptions} Dialect~DialectExecOptions
  * @property {Dialect~DialectTxOptions} tx Transactional state of the {@link Dialect}
  */

/**
 * Abstract class that each database vendor/driver should `extend` from
 */
class Dialect {

  /**
   * Abstract constructor that sets each passed parameter on the current instance as a property (except for `password`).
   * Extending classes should override the constructor using the same parameters since {@link Manager} internally invokes the constructor.
   * @param {String} username the username that will be used to connect to the dialect implementation
   * @param {String} password the password that will be used to connect to the diatect implementation
   * @param {Object} sqlConf the individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {String} name the database name used by the implementing dialect
   * @param {String} [type] the type of database used by the implementing dialect (if supported)
   * @param {String} privatePath the private path used by the originating {@link Manager} that may be used by the dialect private data use (e.g. `tns` files, etc.)
   * @param {Object} [track] an object used to share configuration between dialect implementations
   * @param {Function} [errorLogger] a function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] a function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] a flag that indicates the dialect should be run in debug mode (if supported)
   */
  constructor(username, password, sqlConf, name, type, privatePath, track, errorLogger, logger, debug) {
    this.username = username;
    this.sqlConf = sqlConf;
    this.name = name;
    this.type = type;
    this.privatePath = privatePath;
    this.track = track;
    this.errorLogger = errorLogger;
    this.logger = logger;
    this.debug = debug;
  }

  /**
   * Initializes the {@link Dialect} implementation and optionally opens any resources that be need to {@link Dialect.exec}
   * @param {Dialect~DialectInitOptions} opts The initialization options
   * @returns {*} Any truthy value that indicates the initialization was successfull
   */
  async init(opts) {
    throw new Error(`${this.constructor.name}.init not implemented\nUsing options ${JSON.stringify(opts)}`);
  }

  /**
   * Executes a SQL statement
   * @param {String} sql The SQL to execute
   * @param {Dialect~DialectExecOptions} opts The execution options
   * @param {String[]} frags The frament keys within the SQL that will be retained
   * @returns {(Object[] | null | undefined)} the result set (if any)
   */
  async exec(sql, opts, frags) {
    const dialect = this;
    throw new Error(`${dialect.constructor.name}.exec not implemented (failed on SQL:\n${sql}\nUsing options:\n${JSON.stringify(opts)}\nFragments: ${frags})`);
  }

  /**
   * Commit the current transaction(s) in progress
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {Integer} The number of transactions that were successfully committed
   */
  async commit(opts) {
    throw new Error(`${this.constructor.name}.commit not implemented for option: ${JSON.stringify(opts)}`);
  }

  /**
   * Rollback the current transaction(s) in progress
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {Integer} The number of transactions that were successfully rolled back
   */
  async rollback(opts) {
    throw new Error(`${this.constructor.name}.commit not implemented for options: ${JSON.stringify(opts)}`);
  }

  /**
   * Closes any dialaect resources that may have been opened during {@link Dialect.init}
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {Integer} The number of connections that were closed
   */
  async close(opts) {
    throw new Error(`${this.constructor.name}.close not implemented for options: ${JSON.stringify(opts)}`);
  }

  /**
   * Determines if an {@link Dialect~DialectExecOptions} is setup for [autocommit](https://en.wikipedia.org/wiki/Autocommit)
   * @param {Dialect~DialectExecOptions} opts The execution options
   * @returns {Boolean} A flag indicating that transactions are setup to autocommit
   */
  isAutocommit(opts) {
    throw new Error(`${this.constructor.name}.isAutocommit not implemented for options: ${JSON.stringify(opts)}`);
  }

  /**
   * @returns {Integer} __optonally__ returns the connection count the last time it was checked
   */
  get lastConnectionCount() {
    return 0;
  }

  /**
   * @returns {Integer} __optonally__ returns the number of connections that were in use the last time it was checked
   */
  get lastConnectionInUseCount() {
    return 0;
  }
}

module.exports = Dialect;