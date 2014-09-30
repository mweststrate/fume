var Fume = require("./../src/fume.js");
var G = Fume;
var expect = G.util.expect;

exports.testObservable1 = function(test) {
	var source = new Fume.Observable(true);
	test.ok(!source.isStopped);
	test.ok(!source.hasObservers());

	var x;
	var target = new Fume.Observer();
	target.onNext = function(y) {
		x = y;
	};

	var sub = source.subscribe(target);
	source.next(3);

	test.equals(3, x);
	test.ok(source.hasObservers());

	source.next(4);
	test.equals(4, x);

	sub.dispose();
	test.ok(!source.hasObservers());
	test.ok(source.isStopped);

	test.done();
};

exports.testObservable2 = function(test) {
	var source = new Fume.Observable(false);

	var x;
	var target = new Fume.Observer();
	target.onNext = function(y) {
		x = y;
	};

	var sub = source.subscribe(target);

	source.stop();
	test.ok(!source.hasObservers());
	test.ok(source.isStopped);
	test.ok(x.isStop());

	test.done();
};

// Testing variables
/*exports.*/testvars = function(test) {
	var b = new Fume.ValueBuffer();
	var b2 = new Fume.ValueBuffer();

	var a = new G.Pipe("once");
	a.subscribe(b);
	a.listenTo("twice");
	a.subscribe(b2);
	a.listenTo("second twice");

	test.deepEqual(b.buffer, ["once", "twice", "second twice"]);
	test.deepEqual(b2.buffer, ["twice", "second twice"]);

	b.reset();
	b2.reset();
	var x = new G.Pipe("never");
	x.listenTo("once");
	var unsub = x.subscribe(b);
	x.listenTo("another twice");
	var unsub2 = x.subscribe(b2);
	unsub.dispose();
	x.listenTo("third");
	unsub2.dispose();
	test.ok(x.isStopped);

	test.deepEqual(b.buffer, ["once", "another twice"]);
	test.deepEqual(b2.buffer, ["another twice", "third"]);


	// testing basic function and atomicity
	b.reset();
	x = new G.Variable(2);

	var z = G.multiply(x, x).subscribe(b); //TODO: should be 4, 9

	x.listenTo(3);

	test.deepEqual(b.buffer, [4,6,9]);

	test.done();
};