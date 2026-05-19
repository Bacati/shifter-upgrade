a Full featured and lightweight Schema validation/parsing library

it is meant to be used for input validation

example :

```ts
import Schema, { s, type SchemaInfer } from 'libs/Schema'

const schema = new Schema({
	test: s.record(s.string(), s.object({
		a: s.number().parseString().min(3, 'a is too small')
	}))
})

const t = {
	test: {
		b: {a: '34'}
	}
}

// validate that `t` is coherant with the schema above
const { object, error } = schema.validate(t)
console.log(object, error)
```
