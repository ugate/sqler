'use strict';

const Tester = require('./lib/manager');
const Lab = require('@hapi/lab');
const lab = Lab.script();
exports.lab = lab;
// ESM uncomment the following lines...
// TODO : import * as Lab from '@hapi/lab';
// TODO : import * as Tester from './lib/manager.mjs';
// TODO : export * as lab from lab;

const TEST_TKO = 10000;
const plan = `DB Manager`;

// node test/lib/manager.js -NODE_ENV=test

// "node_modules/.bin/lab" test/manager.js -v
// "node_modules/.bin/lab" test/manager.js -vi 1

lab.experiment(plan, () => {

  lab.test(`${plan}: Basic`, { timeout: TEST_TKO }, Tester.basic);
});