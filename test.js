var G = require("./src/gouda.js");
var expect = G.util.expect;

var a = new G.Variable("once");
a.stream.onValue(expect(["once", "twice", "second twice"]));
a.set("twice");
a.stream.onValue(expect(["twice", "second twice"]));
a.set("second twice");

var b = new G.Variable("never");
b.set("once");
var unsub = b.stream.onValue(expect(["once", "another twice"]));
b.set("another twice");
//TODO: should work, right? unsub();
b.stream.onValue(expect(["another twice"]));

console.log("ok");