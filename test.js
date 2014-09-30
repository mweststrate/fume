var Gouda = require("./src/gouda.js");
var G = Gouda;
var expect = G.util.expect;

// Testing variables
exports.testvars = function(test) {
	var b = new Gouda.Buffer();
	var b2 = new Gouda.Buffer();

	var a = new G.Variable("once");
	a.subscribe(b);
	a.set("twice");
	a.subscribe(b2);
	a.set("second twice");

	test.deepEqual(b.buffer, ["once", "twice", "second twice"]);
	test.deepEqual(b2.buffer, ["twice", "second twice"]);

	b.reset();
	b2.reset();
	var x = new G.Variable("never");
	x.set("once");
	var unsub = x.subscribe(b);
	x.set("another twice");
	var unsub2 = x.subscribe(b2);
	unsub.dispose();
	x.set("third");
	unsub2.dispose();
	test.ok(x.isDisposed);

	test.deepEqual(b.buffer, ["once", "another twice"]);
	test.deepEqual(b2.buffer, ["another twice", "third"]);


	// testing basic function and atomicity
	b.reset();
	x = new G.Variable(2);

	var z = G.multiply(x, x).subscribe(b); //TODO: should be 4, 9

	x.set(3);

	test.deepEqual(b.buffer, [4,6,9]);

	test.done();
};