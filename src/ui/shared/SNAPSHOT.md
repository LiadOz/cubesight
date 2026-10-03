# Snapshot value encoding

The runtime snapshot bridge clones owner models without changing the model
used by the renderer. JSON has no representation for `Infinity`, `-Infinity`,
or `NaN`, so the clone encodes those numeric sentinels as tagged objects:

```json
{"$number":"Infinity"}
```

The other tags are `{"$number":"-Infinity"}` and
`{"$number":"NaN"}`. These tags preserve distinctions that would be lost
by coercing numbers to `null` or strings. They apply only to snapshot output;
the page model retains its original numeric values. For example, Brain's DNF
result remains `Infinity` in the rendered owner model and becomes the tagged
object in the JSON-safe snapshot.
