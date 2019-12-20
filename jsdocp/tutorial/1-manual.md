### 🔧 The Manager
The [Manager](Manager.html) is the entry point for one or more databases/connections. The manager basically consolidates each database connection(s) into a single API. One of the major advantages to this simplistic approach is that service calls from javascript to SQL and back can have no vendor-specific references. That translates into a clean seperation of concerns between the two, allowing SQL changes (or even database swapping) to be made without changing any javascript. In contrast to typical ORM solutions, optimations can be applied directly to the SQL scripts, eliminates javascript edits as SQL scripts evolve, removes the need to generate entity definitions and reduces the complexity of the supporting API (thus making it easier to implement and support additional database vendors/drivers).

> TOC
- [⚙️ Setup &amp; Configuration](#conf)
- [🗃️ SQL Files](#sqlf)
  - [1️⃣ Expanded SQL Substitutions](#es)
  - [2️⃣ Fragment Substitutions](#fs)
  - [3️⃣ Dialect Substitutions](#ds)
  - [4️⃣ Version Susbstitutions](#vs)
  - [5️⃣ Caching SQL](#cache)

#### ⚙️ Setup &amp; Configuration <sub id="conf"></sub>:
There are two types of configuration, _public_ and _private_. Public configurations contain one or more `connections` that will be established during initialization and typically vary depending upon the environment being used (e.g. development, test, ci, production, etc.). See the [manager.connections in the database manager constructor](Manager.html) for a complete listing of public configuration options. Private or _universal_ (`univ`) configuration, on the other hand, is intended to carry sensitive information like connection credentials. Each public connection should contain a `conf.db.connections[].id` that matches a property name in the private configuration `conf.univ.db `. __Both public and private configurations are combined when passed into the [Manager](Manager.html), but shoud be loaded from separate sources__. The following example illustrates this using a matching `myId`:
```sql
-- db/finance/read.ap.companies.sql
SELECT CO.COMPANY AS "company", CO.R_NAME AS "name", CO.PAY_GROUP AS "payGroup", CO.TAX_ACCOUNT AS "taxAccount", CO.TAX_ACCT_UNIT AS "taxAcctUnit",
CO.TAX_SUB_ACCT AS "taxSubAcct"
FROM APCOMPANY CO
WHERE CO.INVOICE_AUDIT = :invoiceAudit
ORDER BY CO.COMPANY ASC
```

```js
// replace xxxx with one of the prexisiting vendor implementations
// or roll your own Dialect
const dialect = 'xxxx', dialectModule = `sqler-${dialect}`;
const { Manager } = require('sqler');
const conf = {
  "univ": {
    "db": {
      "myId": {
        "host": "myhost.example.com",
        "username": "myusername",
        "password": "mypassword"
      }
    }
  },
  "db": {
    "dialects": {
      [dialect]: dialectModule
    },
    "connections": [
      {
        "id": "myId",
        "name": "fin",
        "dir": "db/finance",
        "service": "MYSRV",
        "sql": {
          "dialect": dialect
        }
      }
    ]
  }
};
const mgr = new Manager(conf);
// initialize connections and set SQL functions
await mgr.init();

// execute the SQL statement and capture the results
const rslts = await mgr.db.fin.read.ap.companies({ invoiceAudit: 'Y' }, 'en-US');

// after we're done using the manager we should close it
process.on('SIGINT', async function sigintDB() {
  await mrg.close();
  console.log('Manager has been closed');
});
console.log('Manager is ready for use');
```
Each `conf.db.dialect` property should contain all of the [Dialect](Dialect.html) vendor/driver implmentations used by the manager and can be set to either an extending Dialect class or a _path_ to an extended Dialect module. Many Dialects have already been implemented in separate modules that [listed in the README.md](index.html#dialects). Notice how the genrated SQL function `mgr.db.fin.ap.list.companies` uses the `conf.db.connections[].name` as the property namespace under `db` on the manager instance. Every generated SQL function accepts the following arguments:

- `params` - the named bind parameter names/values to pass into the SQL driver
- `[locale]` - the [BCP 47 language tag](https://tools.ietf.org/html/bcp47) locale that will be used for date formatting
- `[frags]` - the [SQL fragment substitutions](#fs) being used (if any)
- `[ctch]` - _true_ to catch and return errors instead of throwing them

#### 🗃️ <u>SQL Files</u> <sub id="sqlf"></sub>:
Every SQL file used by `sqler` should be organized in a directory under the directory assigned to `conf.mainPath` (defaults to `process.main` or `process.cwd()`). Each subdirectory used should be _unique_ to an individual `conf.db.connections[].name` (default) or `conf.db.connections[].dir`. When the [Manager](Manager.html) is initialized (i.e. [Manager.init](Manager.html#init)) the directory is scanned for SQL files and generates a [Prepared Statement](https://en.wikipedia.org/wiki/Prepared_statement)/`async Function` for each file that is found. Each generated async function will be accessible as a property path of the manager. For instance, a `mainPath` of `/some/sql/path` and a connection with a `conf.db.connections[].name` of `conn1` would look for SQL files under `/some/sql/path/conn1`. If `conf.db.connections[].dir` was set to `otherDir` then SQL files would be prepared from `some/sql/path/otherDir` instead. In either case the generated prepared statement function would be accessible via `manager.db.conn1.read.something()`, assuming that `read.something.sql` resides in the forementioned directory path. To better visualize path computation, consider the following directory structure and the configuration from the previous example:

```
.
+ -- db
|    + -- finance
|    |    + -- ap
|    |    |    + -- delete.audits.sql
|    |    |    + -- update.audits.sql
|    |    + -- ar
|    |    |    + -- delete.audits.sql
|    |    |    + -- update.audits.sql
|    |    + -- create.annual.report.sql
|    |    + -- read.annual.report.sql
```

The subsequent SQL prepared statement functions would be gernerated on the manager instance:

- `mgr.db.fin.ap.delete.audits()`
- `mgr.db.fin.ap.update.audits()`
- `mgr.db.fin.ar.delete.audits()`
- `mgr.db.fin.ar.update.audits()`
- `mgr.db.fin.create.annual.report()`
- `mgr.db.fin.read.annual.report()`

Functions are always added to the `db` object within the manager instance. __Every SQL file name should be prefixed with the [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete) operation that is being performed (i.e. `create`, `read`, `update` or `delete`)__. The use of this nomenclature helps assist implementing [Dialect](Dialect.html) to determine any supplemental processing that may be desired. 

Most RDMS drivers support [prepared statement variable substitutions](https://en.wikipedia.org/wiki/Prepared_statement) in some form or fashion. The most common of which is the typical syntax commonly associated with unamed or named bind parameters within prepared statements. However, `sqler` provides a few substitutional encapsulators that help with SQL statement composition. Each SQL file can define multiple encapsulators that indicates what portions of an SQL statement will be present before execution takes place. Substitutions use an openening `[[` and closing `]]` that can also be optionally prefixed with a SQL line comment `--[[`. The following sections discuss the differnt type of substitutions in more detail.

#### 1️⃣ Expanded SQL Substitutions <sub id="es"></sub>:
Depending on the underlying dialect support, named parameters typically follow some form of syntactic grammar like `:someParam`, where `someParam` is a parameter passed in to the `sqler` generated SQL function as `params`. There may be instances where _any_ number of variables need to be substituded when an SQL statement is executed, but the actual number of variables is unknown at the time the SQL statement is written. This can be accomplished in `sqler` by simply adding a single variable to the SQL statement and passing an array of values during execution. For instance, passing the following `params` JSON into the `sqler` generated SQL statement function:
<br/><br/>__params:__
```json
{
  "someParam": ["one","two","three"]
}
```
__some.query.sql__
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL IN (:someParam)
```
Would result in the following parameters and SQL execution
<br/><br/>__params passed into the driver used by the implementing [Dialect](Dialect.html):__
```json
{
  "someParam": "one",
  "someParam1": "two",
  "someParam2": "three"
}
```
__some.query.sql ---> some.query(params)__
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL IN (:someParam, :someParam1, :someParam2)
```

The normal driver driven variable substitutions would then be handled/applied external to `sqler`.

#### 2️⃣ Fragment Substitutions <sub id="fs"></sub>:
The second type of replacement involves SQL statement segments that are fragmented by use case. An example would be where only a portion of the SQL statement will be included when `frags` is passed into the generated database managed SQL function that matches a key found in the SQL statement that's surrounded by an open (e.g. `[[? someKey]]`) and closing (i.e. `[[?]]`) fragment definition. For instance if `frags` is passed into a managed SQL function that contains `['someKey']` for a SQL statement:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL = 'test'
[[? someKey]] AND SOME_COL2 IS NOT NULL [[?]]
```
the resulting SQL statement will become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL = 'test'
AND SOME_COL2 IS NOT NULL
```
When `frags` is omitted or `frags` contains an array that does not contain a `somekey` value, then the resulting SQL statement would become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL = 'test'
```

> __NOTE: Fragment substitutions cannot be nested__

#### 3️⃣ Dialect Substitutions <sub id="ds"></sub>:
A third type of replacement is dialect specific and allows for SQL files that, for the most part are ANSI compliant, but may have slight deviations in syntax that's specific to an individual database vendor. SQL files can coexist between database vendors, but segments of the SQL statement will only be included when executed under a database within a defined dialect. An example would be the use of `SUBSTR` in Oracle versus the ANSI* use of `SUBSTRING`. A SQL file may contain:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE
[[! oracle]]
SOME_COL = SUBSTR(SOME_COL, 1, 1)
[[!]]
[[! mssql]]
SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1)
[[!]]
```
If an `oracle` dialect were to be used the resulting SQL would become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE
SOME_COL = SUBSTR(SOME_COL, 1, 1)
```
If a `mssql` dialect were to be used the resulting SQL would become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE
SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1)
```

> __NOTE: Dialect substitutions cannot be nested__

#### 4️⃣ Version Susbstitutions <sub id="vs"></sub>:
Sometimes programs connect to DBs that are shared accross one or more applications. Some portions of a program may need to execute SQL statements that are similar in nature, but have some versioning discrepancies between database instances. Say we have a database instance for an up-and-coming version that has some modifications made to it's structure, but is not enough to warrent two separate copies of the same SQL statement file. It may make more sense to maintain one copy of a SQL file/statement and account for the discrepancies within the SQL file. We can do so by encapsulating the SQL segment by surrounding it with an opening `[[version = 1]]` and closing `[[version]]` key (valid version quantifiers can be `=`, `<`, `>`, `<=`, `>=` or `<>`). So, if there were a SQL file that contained:
```sql
SELECT
[[version <= 1]]
SOME_OLD_COL
[[version]]
[[version > 1]]
SOME_NEW_COL
[[version]]
FROM SOME_TABLE
```
When the `sqler` managed connection configuration contained `version` with a value of `1` (or any value less than one) then the resulting SQL would become:
```sql
SELECT
SOME_OLD_COL
FROM SOME_TABLE
```
Likewise, a `version` of `1.5` would result in the following SQL:
```sql
SELECT
SOME_NEW_COL
FROM SOME_TABLE
```

> __NOTE: Version substitutions cannot be nested__

#### Caching SQL <sub id="cache"></sub>:
By default all SQL files are read once during [Manager.init](Manager.html#init), but there are other options for controlling the frequency of the SQL file reads by passing a [cache](global.html#Cache) container into the [Manager constructor](Manager.html#Manager).