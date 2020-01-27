'use strict';

const Tester = require('./lib/options');
const { Labrat } = require('@ugate/labrat');
const { expect } = require('@hapi/code');
const Lab = require('@hapi/lab');
const lab = Lab.script();
exports.lab = lab;
// ESM uncomment the following lines...
// TODO : import * as Tester from './lib/options.mjs';
// TODO : import { expect } from '@hapi/code';
// TODO : import { Labrat } from '@ugate/labrat';
// TODO : import * as Lab from '@hapi/lab';
// TODO : export * as lab from lab;

const plan = `Options`;

// node test/lib/options.js -NODE_ENV=test

// "node_modules/.bin/lab" test/options.js -v
// "node_modules/.bin/lab" test/options.js -vi 1

lab.experiment(plan, () => {

  if (Tester.before) lab.before(Tester.before);
  if (Tester.after) lab.after(Tester.after);
  if (Tester.beforeEach) lab.beforeEach(Tester.beforeEach);
  if (Tester.afterEach) lab.afterEach(Tester.afterEach);

  lab.test(`${plan}: Missing Configuration (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'conf' }, Tester.valConfMissing));
  lab.test(`${plan}: Null Universe (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'univ = null' }, Tester.valUnivNull));
  lab.test(`${plan}: Null Universe DB (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'univ.db = null' }, Tester.valUnivDbNull));
  lab.test(`${plan}: Empty Universe DB (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'univ.db = {}' }, Tester.valUnivDbEmpty));
  lab.test(`${plan}: Null Host (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'host = null' }, Tester.valHostNull));
  lab.test(`${plan}: Null DB (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'db = null' }, Tester.valDbNull));
  lab.test(`${plan}: Null Dialects (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'dialects = null' }, Tester.valDialectsNull));
  lab.test(`${plan}: Empty Dialects (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'dialects = []' }, Tester.valDialectsEmpty));
  lab.test(`${plan}: Custom Loggers`, Tester.valLoggers);
  lab.test(`${plan}: Null Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections = null' }, Tester.valConnectionsNull));
  lab.test(`${plan}: Empty Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections = []' }, Tester.valConnectionsEmpty));
  lab.test(`${plan}: Missing ID Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections[].id = null' }, Tester.valConnectionsIdMissing));
  lab.test(`${plan}: Missing Name Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections[].name = null' }, Tester.valConnectionsNameMissing));
  lab.test(`${plan}: Missing Dir Connections`, Tester.valConnectionsDirMissing);
  lab.test(`${plan}: Missing Dialect Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections[].dialect = null' }, Tester.valConnectionsDialectMissing));
  lab.test(`${plan}: Invalid Dialect Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'typeof connections[].dialect !== "string"' }, Tester.valConnectionsDialectinvalid));
  lab.test(`${plan}: Mismatch Dialect Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'univ.db[connections[].id] = undefined' }, Tester.valConnectionsDialectMismatch));
  lab.test(`${plan}: External Dialect Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections[].dialect = <some external module id>' }, Tester.valConnectionsDialectImportExternal));
  lab.test(`${plan}: Duplicate Connections (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections duplicate' }, Tester.valConnectionsIdDuplicate));
  lab.test(`${plan}: Connections Substitutes`, Tester.valConnectionsSubstitutes);
  lab.test(`${plan}: Connections Binds`, Tester.valConnectionsBinds);
  lab.test(`${plan}: Missing Connections Driver Options`, Tester.valConnectionsDriverOptionsMissing);
  lab.test(`${plan}: Connections Log None`, Tester.valConnectionsLogNone);
  lab.test(`${plan}: Connections Log Custom Tags`, Tester.valConnectionsLogTags);
  lab.test(`${plan}: Connections Log Custom Tags (with custom logger)`, Tester.valConnectionsLogTagsWithCustomLogger);
  lab.test(`${plan}: Nonexistent Main Path (Error)`, Labrat.expectFailure(['onUnhandledRejection', 'onUncaughtException'], { expect, label: 'mainPath' }, Tester.valNonexistentMainPath));
  lab.test(`${plan}: Empty DB In Main Path`, Tester.valMainPathEmpty);
  lab.test(`${plan}: Custom Private Path`, Tester.valPrivatePath);
  lab.test(`${plan}: Init Error Return`, Tester.valInitErrorReturn);
  lab.test(`${plan}: Reinitialize Manager (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'connections duplicate' }, Tester.valReinit));
  lab.test(`${plan}: Debug`, Tester.valDebug);
});