<b class="jsdocp-remove-me">

# ![](https://raw.githubusercontent.com/ugate/sqler/master/jsdocp/static/favicon-32x32.png) `sqler`

[![npm version](https://badgen.net/npm/v/sqler?color=orange&icon=npm)](https://www.npmjs.com/package/sqler)
[![Build Status](https://badgen.net/travis/ugate/sqler?icon=travis)](https://travis-ci.com/ugate/sqler)
[![Dependency Status](https://badgen.net/david/dep/ugate/sqler)](https://david-dm.org/ugate/sqler)
[![Dev Dependency Status](https://badgen.net/david/dev/ugate/sqler)](https://david-dm.org/ugate/sqler?type=dev)

</b>

Skip the ORM and simplify your SQL execution plans using plain 💯% SQL systax.<br/><br/>
A Node.js manager for [RDBMS](https://en.wikipedia.org/wiki/Relational_database) systems that autogenerates/manages SQL execution functions from underlying SQL statement files. Features include:

* Debugging options that allow for near real time updates to SQL files without restarting an application
* Autogeneration of object paths that coincide with SQL file paths
* [Expanded SQL substitutions](#ps), [fragment substitutions](#fs), [dialect specific substitutions](#ds) and [version specific substitutions](#vs)
* Unlike strict ORM/API based solutions, models are generated on the fly- lending itself to a more function centric design with minimal overhead and maximum/optimal utilization of SQL syntax and DBA interaction

### SQL Prepared Statements &amp; Variable Substitutions <sub id="ps"></sub>:
Most RDMS drivers support [prepared statement variable substitutions](https://en.wikipedia.org/wiki/Prepared_statement) in some form or fashion. Each SQL file can define multiple encapsulators that indicates what portions of an SQL statement will be present before execution takes place. The simplest of which is the typical syntax commonly associated with named parameters within prepared statements.

Depending on the underlying dialect support, named parameters follow the format `:someParam` where `someParam` is a parameter passed in to the `sqler` generated SQL function as `params`. An alternative and sometimes more universal format would be to use an array of values. For instance, passing the following `params` JSON into the subsequently generated SQL statement function:
<br/><br/>__params__
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
<br/><br/>__params passed into the driver impl:__
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

#### Fragment Substitutions <sub id="fs"></sub>:
The second type of replacement involves SQL statement segments that are fragmented by use case. An example would be where only a portion of the SQL statement will be included when `frags` is passed into the generated DB managed SQL function that matches a key found in the SQL statement that's surrounded by an open (e.g. `[[? someKey]]`) and closing (i.e. `[[?]]`) fragment definition. For instance if `frags` is passed into a DB managed SQL function that contains `['someKey']` for a SQL statement:
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

#### Dialect Substitutions <sub id="ds"></sub>:
A third type of replacement is dialect specific and allows for SQL files that, for the most part are ANSI compliant, but may have slight deviations in syntax that's specific to an individual DB vendor. SQL files can coexist between DB vendors, but segments of the SQL statement will only be included when executed under a DB within a defined dialect. An example would be the use of `SUBSTR` in Oracle versus the ANSI* use of `SUBSTRING`. A SQL file may contain:
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

#### Version Susbstitutions <sub id="vs"></sub>:
Sometimes programs connect to DBs that are shared accross one or more applications. Some portions of a program may need to execute SQL statements that are similar in nature, but have some versioning discrepancies between DB instances. Say we have a DB instance for an up-and-coming version that has some modifications made to it's structure, but is not enough to warrent two separate copies of the same SQL statement file. It may make more sense to maintain one copy of a SQL file/statement and account for the discrepancies within the SQL file. We can do so by encapsulating the SQL segment by surrounding it with an opening `[[version = 1]]` and closing `[[version]]` key (valid version quantifiers can be `=`, `<`, `>`, `<=`, `>=` or `<>`). So, if there were a SQL file that contained:
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