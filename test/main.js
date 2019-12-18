'use strict';

const Tester = require('./lib/main');
const Lab = require('@hapi/lab');
const lab = Lab.script();
exports.lab = lab;
// ESM uncomment the following lines...
// TODO : import * as Lab from '@hapi/lab';
// TODO : import * as Tester from './lib/main.mjs';
// TODO : export * as lab from lab;

const TEST_TKO = 10000;
const plan = `DB Manager`;

// node test/lib/main.js -NODE_ENV=test

// "node_modules/.bin/lab" test/main.js -v
// "node_modules/.bin/lab" test/main.js -vi 1

lab.experiment(plan, () => {

  lab.test(`${plan}: No Cache`, { timeout: TEST_TKO }, Tester.noCache);
  lab.test(`${plan}: Interval Cache`, { timeout: TEST_TKO }, Tester.intervalCache);
});