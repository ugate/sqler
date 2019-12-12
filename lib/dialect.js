'use strict';

/**
 * Abstract class that each database vendor/driver should `extend` from
 */
class Dialect {

  /**
   * Abstract constructor that sets each passed parameter on the current instance (except for `password`). Extending classes should override the constructor using the same parameters
   * @param {String} username the username that will be used to connect to the dialect implementation
   * @param {String} password the password that will be used to connect to the diatect implementation
   * @param {Object} sqlConf the individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {String} name the database name used by the implementing dialect
   * @param {String} [type] the type of database used by the implementing dialect (if supported)
   * @param {String} privatePath the private path used by the originating {@link Manager}
   * @param {Object} [track] an object used to share configuration between dialect implementations
   * @param {Function} [errorLogger] a function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] a function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] a flag that indicates the dialect should be rena in debug mode (if supported)
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
   * @returns {*} Any truthy value that indicates the initialization was successfull
   */
  async init() {
    return Promise.reject(new Error(`${this.constructor.name}.init not implemented`));
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute 
   * @param {Object} [opts] the options that control SQL execution
   * @param {Object} [opts.statementOptions] the options applied to the SQL statement (if any)
   * @param {Object} [opts.bindVariables] the key/value pair of replacement parameters that will be bound in the SQL statement
   * @param {String} [opts.type] the type of SQL execution (e.g. 'SELECT', etc.)
   * @param {String[]} frags the frament keys within the SQL that will be retained
   * @returns {Object[]} the result set (if any)
   */
  async exec(sql, opts, frags) {
    const dialect = this;
    return Promise.reject(new Error(`${dialect.constructor.name}.exec not implemented (failed on SQL:\n${sql}\nUsing options:\n${JSON.stringify(opts)}\nFragments: ${frags})`));
  }

  /**
   * Closes any dialaect resources that may have been opened during {@link Dialect.init}
   */
  async close() {
    return Promise.reject(new Error(`${this.constructor.name}.close not implemented`));
  }
}

module.exports = Dialect;