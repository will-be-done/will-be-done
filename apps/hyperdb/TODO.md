TODO next:
1. DONE Fix sqldriver. Fix types. Add OR query. Make uniq index + id final col in index. Enable test
3. DONE Remove limit from scan opts
4. DONE Actions
5. DONE Make columns type checks in tuples
6. DONE Make DB interface so DB and SubscribableDB will match
7. Add query syntax
7. Add tx support
6. Fix hash for inmem to allow storing duplicates


MUST:
1. Action creator
2. Indexes not typing
8. for bptree use normal yeild, without array return
2. Add ability ot select just one field
1. Interval sorting and merging

1. generator based DbDrier interface
2. action creator
3. fix index is not typing. Also make sure tuple is typing correctly
4. maybe use bptree npm? 
5. use yield in bptree
6. tx support
7. undo/redo
8. DONE hash indexes on any field
8. for sqlite - id is always final column. And index should be uniq
9. Use index definition like this:

cols: [],
type: "btree" | "hash"

And have only one rangeScan, remove equalScan
10. Return insert uniq validation
11. Hash range is incorrect! It doesn't allow to store duplicates! Maybe value of Map should be array?

10. Remove limit from scan options
11. Interval merging to avoid result duplication for inmem btree

Optional:
1. generator based change streaming
