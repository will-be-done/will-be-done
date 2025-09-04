Diff apply algo when client receive he should compare changeset with hist
in-mem changeset. It also mean that I need to do changeset tracking on in-mem db too,
but only for changed models. 

It means that we will not apply changes that may be overriden of current client changes,
but this client hanges will still be sent to persistent db and to to the server.

So it means that we will be always waiting for client changes and never overriding ig it has
newer than received from server.

