'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('../../index');
const IntervalCache = require('../cache/interval-cache');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from '../../index.mjs';
// TODO : import * as IntervalCache from '../cache/interval-cache.mjs';

let mgr, cache;

// TODO : ESM uncomment the following line...
// export
class Tester {

  static async beforeEach() {
    const cch = cache;
    cache = null;
    if (cch && cch.start) await cch.start();
  }

  static async afterEach() {
    const cch = cache;
    cache = null;
    if (cch && cch.stop) await cch.stop();
  }

  static async basic() {
    if (LOGGER.info) LOGGER.info(`Begin basic test`);
    
    const conf = getConf(), cacheOpts = { expiresIn: 100 };
    cache = new IntervalCache(cacheOpts);
    mgr = new Manager(conf, cache, !!LOGGER.info);
    await mgr.init();
    
    const rslt1 = await mgr.tst.some.query({ var1: 1, var2: 'two', var3: true }, 'en-US');
    if (LOGGER.info) LOGGER.info('RESULT #1:', rslt1);
    
    // change the SQL file


    // wait for the the SQL statement to expire
    await Labrat.wait(cacheOpts.expiresIn);

    const rslt2 = await mgr.tst.some.query({ var1: 1, var2: 'two', var3: true }, 'en-US');
    if (LOGGER.info) LOGGER.info('RESULT #2:', rslt2);
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

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}