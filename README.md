fume
====

Enjoy your pipe. Higher order FRP framework.

Fume is a framework that helps to maintain data and relations between data using reactive principles. What that means can be explained best by giving some examples:

```javascript
var g = require('fumejs');

var price = g(20);
var taxrate = g(0.19);
var vat = g.multiply(price, vat);

g.watch(vat);
//prints "3.8"

taxrate.set(0.21);
//prints "4.2"

price.set(30)
//prints "6.3"
```

This simple example demonstrates the principle behind Fume; data relations are maintained, in a similar way as Microsoft Excel formulas. However, Gouda takes this principle way further, it doesn't maintain just relations between primitive values, but also between objects, arrays, and even functions! If you find it hard to believe, take the following example.

```javascript
var g = require('fumejs');

var numbers = g([1, 2, 3]);
var mapper = g.variable(g.func("x", g.multiply(g.get("x"), 2)));

g.watch(numbers.map(mapper));
//prints [2,4,6]

numbers.push(5);
//prints [2,4,6,10]

mapper.set(g.func("y", g.add(g.get("y", 3))));
//prints [4,5,6,8]
```

Wait, don't read too quickly! Did you see how the mapped array got updated when the original array was changed? And even when the mapping function was replaced? This means that developers no longer have to worry when to recalculate which data. Fume will keep all your data up to date. Cheesy!

It is also possible to use a more convenient syntax for manipulating data with Fume, by using fumescripts (.gs) in the gouda interpreter (can be installed using npm install -g gouda-cli). The example from above will read in goudascript as:

```javascript
var numbers = [1,2,3];
var mapper = (x) -> x * 2;

watch(numbers.map(mapper));
//prints [2,4,6]

numbers.push(5);
//prints [2,4,6,10]

mapper = (y) -> y + 3;
//prints [4,5,6,8]
````

# Extended example

```javascript

val transactions = [];

val BankAccount = {
	balance =
		transactions.filter(t => t.to = this).map(t.amount).sum()
		-
		transactions.filter(t => t.from = this).map(t.amount).sum()
}

val tarzan = new BankAccount();
var jane = new BankAccount();
val bankTotal = tarzan.balance + jane.balance

tarzan.balance.subscribe(console.log);
jane.balance.subscribe(console.log);


transactions.add({ from : 'bank', to: tarzan, amount: 30})
//prints 30
//prints 30
transactions.add({ from : 'bank', to: jane, amount: 200})
//prints 200
//prints 230
transactions.add({ from : jane, to: tarzan, amount: 40})
//prints 70
//prints 160
//prints 230
transactions.add({ from : tarzan, to: jane, amount: 2})
//prints 68
//prints 162
//prints 230
```
