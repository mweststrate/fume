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

exports.testPipe1 = function(test) {
	var b = new Fume.ValueBuffer();
	var p = new Fume.Pipe(3);
	var s1 = p.subscribe(b);

	p.observe(4);

	p.onNext(Fume.Event.Dirty());
	p.observe(5);
	p.observe(6);
	p.onNext(Fume.Event.Ready());

	test.deepEqual(b.buffer, [3,4,5, 6]);
	var b2 = new Fume.ValueBuffer();
	var s2 = p.subscribe(b2);

	test.deepEqual(b2.buffer, [6]);

	s1.dispose();

	p.observe(7);
	p.observe(7);

	test.deepEqual(b.buffer, [3,4,5,6]);
	test.deepEqual(b2.buffer, [6,7]);
	s2.dispose();

	test.ok(p.isStopped);
	test.ok(!p.hasObservers());
	test.done();
};

exports.testCycleDetection = function(test) {
	var p = new Fume.Pipe(3);
	var last;

	var sub = p.subscribe(function(value) {
		if (!value.isReady() && !value.isDirty())
			last = value;
	});

	test.equals(last.value, 3);
	p.observe(p);

	test.ok(last.isError());

	test.equals(last.code, "cycle_detected");

	p.observe(1);

	test.equals(last.value, 1);

	sub.dispose();
	test.ok(!p.hasObservers());
	test.ok(p.isStopped);
	test.done();
};

exports.testMultiply = function(test) {
	var b = new Fume.ValueBuffer();
	var b2 = new Fume.ValueBuffer();

	var a = new G.Pipe("once");
	a.subscribe(b);
	a.observe("twice");
	a.subscribe(b2);
	a.observe("second twice");

	test.deepEqual(b.buffer, ["once", "twice", "second twice"]);
	test.deepEqual(b2.buffer, ["twice", "second twice"]);

	b.reset();
	b2.reset();
	var x = new G.Pipe("never");
	x.observe("once");
	var unsub = x.subscribe(b);
	x.observe("another twice");
	var unsub2 = x.subscribe(b2);
	unsub.dispose();
	x.observe("third");
	unsub2.dispose();
	test.ok(x.isStopped);

	test.deepEqual(b.buffer, ["once", "another twice"]);
	test.deepEqual(b2.buffer, ["another twice", "third"]);


	// testing basic function and atomicity
	b.reset();
	x = new G.Pipe(2);

	var z = new G.multiply(x, x).subscribe(b);

	x.observe(3);

	test.deepEqual(b.buffer, [4,9]); //Note, no inbetween 6!

	x.observe(4);

	test.deepEqual(b.buffer, [4,9,16]);

	test.done();
};