'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('../../index');
const IntervalCache = require('../cache/interval-cache');
const Fs = require('fs');
const { expect } = require('@hapi/code');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from '../../index.mjs';
// TODO : import * as IntervalCache from '../cache/interval-cache.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import { expect } from '@hapi/code';

const priv = { mgr: null, cache: null };

// TODO : ESM uncomment the following line...
// export
class Tester {

  static async beforeEach() {
    const cch = priv.cache;
    priv.cache = null;
    if (cch && cch.start) await cch.start();
  }

  static async afterEach() {
    const cch = priv.cache;
    priv.cache = null;
    if (cch && cch.stop) await cch.stop();
  }

  static async noCache() {
    return testSql();
  }

  static async intervalCache() {
    const cacheOpts = { expiresIn: 100 };
    return testSql(new IntervalCache(cacheOpts), cacheOpts);
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

function getConf() {
  const conf = {
    "mainPath": 'test',
    "univ": {
      "db": {
        "testId": {
          "host": "myhost.example.com",
          "username": "myusername",
          "password": "mypassword"
        }
      }
    },
    "db": {
      "dialects": {
        "test": './test/dialects/test-dialect'
      },
      "connections": [
        {
          "id": "testId",
          "name": "tst",
          "dir": "db",
          "service": "TESTSRV",
          "sql": {
            "dialect": "test"
          }
        }
      ]
    }
  };
  return conf;
}

/**
 * Tests that SQL statements work with and w/o {@link Cache} by re-writting the SQL file to see if the cahce picks it up
 * @param {Cache} [cache] the {@link Cache} that will be used for SQL statements
 * @param {Object} [cacheOpts] the options that were used on the specified {@link Cache}
 */
async function testSql(cache, cacheOpts) {
  if (LOGGER.info) LOGGER.info(`Begin basic test`);
    
  const conf = getConf();
  priv.cache = cache;
  priv.mgr = new Manager(conf, priv.cache, !!LOGGER.info);
  await priv.mgr.init();
  
  const binds = { someCol1: 1, someCol2: 2, someCol3: 3 };
  const rslt1 = await priv.mgr.db.tst.some.query(binds, 'en-US');
  
  expect(rslt1).to.be.array();
  expect(rslt1).to.be.length(2); // two records should be returned w/o order by
  if (LOGGER.info) LOGGER.info('BEFORE Cache Update:', rslt1);
  
  
  // change the SQL file
  const sql = (await sqlFile()).toString();
  try {
    // update the file
    await sqlFile(`${sql}\nORDER BY SOME_COL1`);

    // wait for the the SQL statement to expire
    await Labrat.wait(cacheOpts && cacheOpts.hasOwnProperty('expiresIn') ? cacheOpts.expiresIn : 1000);

    const rslt2 = await priv.mgr.db.tst.some.query(binds, 'en-US');

    expect(rslt2).to.be.array();
    expect(rslt2).to.be.length(cache ? 1 : 2); // one record w/order by and updated by cache
    if (LOGGER.info) LOGGER.info('AFTER Cahce Update:', rslt2);

  } finally {
    await sqlFile(sql);
  }
}

/**
 * Reads/writes test SQL file
 * @param {String} [sql] The SQL to write to the test file (omit to just read file)
 */
async function sqlFile(sql) {
  const sqlPath = './test/db/some.query.sql';
  if (typeof sql === 'string') {
    return Fs.promises.writeFile(sqlPath, sql);
  } else {
    return Fs.promises.readFile(sqlPath);
  }
}

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}