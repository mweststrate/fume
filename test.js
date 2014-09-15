var G = require("./src/gouda.js");
var expect = G.util.expect;


var a = new G.Variable("once");
a.onValue(expect(["once", "twice", "second twice"]));
a.set("twice");
a.onValue(expect(["twice", "second twice"]));
a.set("second twice");

var b = new G.Variable("never");
b.set("once");
var unsub = b.onValue(expect(["once", "another twice"]));
b.set("another twice");
//TODO: should work, right?
unsub.dispose();
b.onValue(expect(["another twice"]));


var x = new G.Variable(2);

var z = G.multiply(x, x).subscribe(expect([4,6,9])); //TODO: should be 4, 9

x.set(3);


console.log("ok");