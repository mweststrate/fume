var G = require("./src/gouda.js");
var expect = G.util.expect;

//Testing classes

var clazzA = G.util.declare({
	init: function(x) {
		this.value = x;
	},
	getX : function() {
		return this.value;
	}
});

var clazzB = G.util.declare(clazzA, {
	init : function() {
		this.value = 2;
		this.super.init.call(this, 3);
	},
	getX : function() {
		return this.super.getX.call(this);
	}
});

var b = new clazzB();
if (3 !== b.getX())
	throw new Error("Failed constructor");
if (3 !== b.value)
	throw new Error("Failed value");

// Testing variables

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



// testing basic function and atomicity

var x = new G.Variable(2);

var z = G.multiply(x, x).subscribe(expect([4,6,9])); //TODO: should be 4, 9

x.set(3);


console.log("ok");