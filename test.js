var G = require("./src/gouda.js");
var expect = G.util.expect;

//Testing classes

var clazzA = G.util.declare({
	initialize: function(x) {
		this.value = x;
	},
	getX : function() {
		return this.value;
	}
});

var clazzB = G.util.declare(clazzA, {
	initialize : function($super) {
		this.value = 2;
		$super(3);
		//this.super.init.call(this, 3);
	},
	getX : function($super) {
		return $super(this);
	}
});

var b = new clazzB();
if (3 !== b.getX())
	throw new Error("Failed constructor");
if (3 !== b.value)
	throw new Error("Failed value");
if (!(b instanceof clazzB))
	throw new Error("Failed instanceof B");
if (!(b instanceof clazzA))
	throw new Error("Failed instanceof A");

// Testing variables

var a = new G.Variable("once");
a.subscribe(expect(["once", "twice", "second twice"]));
a.set("twice");
a.subscribe(expect(["twice", "second twice"]));
a.set("second twice");

var b = new G.Variable("never");
b.set("once");
var unsub = b.subscribe(expect(["once", "another twice"]));
b.set("another twice");
var unsub2 = b.subscribe(expect(["another twice","third"]));
unsub.dispose();
b.set("third");
unsub2.dispose();
if (!b.isDisposed)
	throw new Error("Should be disposed");



// testing basic function and atomicity

var x = new G.Variable(2);

var z = G.multiply(x, x).subscribe(expect([4,6,9])); //TODO: should be 4, 9

x.set(3);


console.log("ok");