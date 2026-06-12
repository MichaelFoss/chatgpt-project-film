# events/

Immutable append-only event history.

Events are the deepest durable layer of truth.

The current catalog event stream is:

```text
events/catalog.events.ndjson
```

The current title reaction event stream is:

```text
events/title-reactions.events.ndjson
```

Title reaction events may include optional spoiler-free `notes` values
and optional free-form `reasons` arrays. Do not manually add empty
`notes` strings or empty `reasons`; blank values are treated as absent
by the projection.

Do not manually rewrite historical events.
