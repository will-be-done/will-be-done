1. generator based DbDrier interface
2. action creator
3. fix index is not typing. Also make sure tuple is typing correctly
4. maybe use bptree npm? 
5. use yield in bptree
6. tx support
7. undo/redo
8. hash indexes on any field
8. for sqlite - id is always final column. And index should be uniq
9. Use index definition like this:

cols: [],
type: "btree" | "hash"

And have only one rangeScan, remove equalScan
10. Return insert uniq validation
11. Hash range is incorrect! It doesn't allow to store duplicates! Maybe value of Map should be array?

Optional:
1. generator based change streaming
