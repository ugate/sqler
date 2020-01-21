SELECT SOME_COL1, SOME_COL2, SOME_COL3
FROM SOME_TABLE
WHERE SOME_COL1 IN (:expanedCol)
[[! test]]
AND DIALECT_SUB_TEST_COL = SUBSTR(SOME_COL1, 1, 1)
[[!]]
[[! removeMeDialect]]
AND DIALECT_SUB_REMOVE_ME_COL = SUBSTRING(SOME_COL1 FROM 1 FOR 1)
[[!]]
[[version <= 1]]
AND VERSION_SUB_TEST_COL1 = 0
[[version]]
[[version = 1]]
AND VERSION_SUB_TEST_COL1 = 1
[[version]]
[[version > 1]]
AND VERSION_SUB_TEST_COL1 = 2
[[version]]
[[version <> 1]]
AND VERSION_SUB_TEST_COL2 = 3
[[version]]
[[? myFragKey]] AND FRAG_SUB_TEST_COL IS NOT NULL [[?]]