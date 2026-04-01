'use strict';
const typedefs = require('../../typedefs');
const { format } = require('util');
const TEST_DATE = new Date();
class UtilOpts {
 static get TEST_DIALECT() {
  return require('../dialects/test-dialect');
 }
 static getConf(mainPath) {
  const conf = {
   mainPath: mainPath || 'test',
   univ: {
    db: {
     testId: {
      host: 'myhost.example.com',
      username: 'myusername',
      password: 'mypassword'
     }
    }
   },
   db: {
    dialects: {
     test: './test/dialects/test-dialect'
    },
    connections: [
     {
      id: 'testId',
      name: 'tst',
      dir: 'db',
      service: 'TESTSRV',
      dialect: 'test',
      driverOptions: {
       numOfPreparedFuncs: 0,
       throwExecError: false
      }
     }
    ]
   }
  };
  return conf;
 }
 static createExecOpts(exclExpansion, opts) {
  const xopts = opts || {};
  xopts.binds = { someCol1: 1, someCol2: 2, someCol3: 3 };
  if (!exclExpansion) xopts.binds.expanedCol = [1, 2, 3];
  return xopts;
 }
 static createConnectionBinds() {
  return { someCol1: 1, someCol2: 2, someCol3: 3, someCol4: 4, someColDate: TEST_DATE };
 }
 static createSubstituteOpts() {
  return { SOME_OTHER_DB: 'SOME_OTHER_TEST_DB' };
 }
 static createSubstituteDriverOptsDialects() {
  return { present: ['DIALECT_SUB_TEST_COL'], absent: ['DIALECT_SUB_REMOVE_ME_COL'] };
 }
 static createSubstituteDriverOptsVersions(presentVersion, absentVersion) {
  const rtn = { present: [], absent: [] };
  const pvers = Array.isArray(presentVersion) ? presentVersion : [presentVersion];
  for (const pver of pvers) rtn.present.push(`VERSION_SUB_TEST_COL1 = ${pver}`);
  const avers = Array.isArray(absentVersion) ? absentVersion : [absentVersion];
  for (const aver of avers) rtn.absent.push(`VERSION_SUB_TEST_COL1 = ${aver}`);
  return rtn;
 }
 static createSubstituteDriverOptsFrags() {
  return { myFragKey: 'FRAG_SUB_TEST_COL IS NOT NULL' };
 }
 static extractConnConf(conf, name) {
  for (const conn of conf.db.connections) {
   if (conn.name === name) return conn;
  }
 }
 static generateTestConsoleLogger(tags) {
  return function testConsoleLogger(o) {
   const logs = typeof o === 'string' ? [format.apply(null, arguments)] : arguments;
   const tagsLabel = `[${tags ? tags.join() : ''}]`;
   for (let i = 0, l = logs.length; i < l; ++i) {
    if (tags && tags.includes('error')) console.error(`${tagsLabel} ${logs[i]}`);
    else if (tags && tags.includes('warn')) console.warn(`${tagsLabel} ${logs[i]}`);
    else console.log(`${tagsLabel} ${logs[i]}`);
   }
  };
 }
 static generateTestAbyssLogger() {
  return function testAbyssLogger() {};
 }
 static driverOpt(opt, execOpts, connConf) {
  if (execOpts && execOpts.driverOptions && Object.prototype.hasOwnProperty.call(execOpts.driverOptions, opt)) {
   return { source: 'execution', value: execOpts.driverOptions[opt] };
  } else if (connConf && connConf.driverOptions && Object.prototype.hasOwnProperty.call(connConf.driverOptions, opt)) {
   return { source: 'connection', value: connConf.driverOptions[opt] };
  }
  return {};
 }
}
module.exports = UtilOpts;