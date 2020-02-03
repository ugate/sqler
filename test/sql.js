'use strict';

const Tester = require('./lib/sql');
const { Labrat } = require('@ugate/labrat');
const { expect } = require('@hapi/code');
const Lab = require('@hapi/lab');
const lab = Lab.script();
exports.lab = lab;
// ESM uncomment the following lines...
// TODO : import * as Tester from './lib/sql.mjs';
// TODO : import { expect } from '@hapi/code';
// TODO : import { Labrat } from '@ugate/labrat';
// TODO : import * as Lab from '@hapi/lab';
// TODO : export * as lab from lab;

const TEST_TKO = 10000;
const plan = `DB Manager`;

// node test/lib/sql.js -NODE_ENV=test

// "node_modules/.bin/lab" test/sql.js -v
// "node_modules/.bin/lab" test/sql.js -vi 1

lab.experiment(plan, () => {

  if (Tester.before) lab.before(Tester.before);
  if (Tester.after) lab.after(Tester.after);
  if (Tester.beforeEach) lab.beforeEach(Tester.beforeEach);
  if (Tester.afterEach) lab.afterEach(Tester.afterEach);

  lab.test(`${plan}: Read`, { timeout: TEST_TKO }, Tester.read);
  lab.test(`${plan}: Read Return Error`, { timeout: TEST_TKO }, Tester.readErrorReturn);
  lab.test(`${plan}: Read Throw Error`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'read throw' }, Tester.readErrorThrow));
  lab.test(`${plan}: Read With SQL Dialect Substitutions`, { timeout: TEST_TKO }, Tester.readWithSubstitutionsDialects);
  lab.test(`${plan}: Read With SQL Version = 1 Substitutions`, { timeout: TEST_TKO }, Tester.readWithSubstitutionsVersionNegative1);
  lab.test(`${plan}: Read With SQL Version = 1 Substitutions`, { timeout: TEST_TKO }, Tester.readWithSubstitutionsVersion1);
  lab.test(`${plan}: Read With SQL Version = 2 Substitutions`, { timeout: TEST_TKO }, Tester.readWithSubstitutionsVersion2);
  lab.test(`${plan}: Read With SQL Fragment Substitutions`, { timeout: TEST_TKO }, Tester.readWithSubstitutionsFrags);
  lab.test(`${plan}: Interval Cache`, { timeout: TEST_TKO }, Tester.intervalCache);
  lab.test(`${plan}: Execute Multiple Iterations`, { timeout: TEST_TKO }, Tester.execMultipleIterations);
});