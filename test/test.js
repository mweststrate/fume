var Fume = require("./../src/fume.js");
var F = Fume;
var expect = F.util.expect;
var Event = Fume.Event;

exports.testObservable1 = function(test) {
	var source = new Fume.Stream(true);
	test.ok(!source.isStopped);
	test.ok(!source.hasObservers());

	var x;
	var target = new Fume.Observer();
	target.in = function(y) {
		x = y;
	};

	var sub = source.subscribe(target);
	source.out(3);

	test.equals(3, x);
	test.ok(source.hasObservers());

	source.out(4);
	test.equals(4, x);

	debugger;
	test.ok(sub.observing);
	sub.dispose();
	test.ok(!sub.observing);

	test.ok(!source.hasObservers());
	test.ok(source.isStopped);

	test.done();
};

exports.testObservable2 = function(test) {
	var source = new Fume.Stream(false);

	var x;
	var target = new Fume.Observer();
	target.in = function(y) {
		x = y;
	};

	var sub = source.subscribe(target);

	source.stop();
	test.ok(!source.hasObservers());
	test.ok(source.isStopped);
	test.ok(x.isStop());

	test.done();
};

exports.testRelay1 = function(test) {
	var b = new Fume.ValueBuffer();
	var p = new Fume.Relay(3);
	var s1 = p.subscribe(b);

	p.observe(4);

	p.in(Fume.Event.dirty());
	p.observe(5);
	p.observe(6);
	p.in(Fume.Event.ready());

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

exports.testCycleDetection1 = function(test) {
	var p = new Fume.Relay(3);
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

exports.testCycleDetection2 = function(test) {
	//Fume.trace = true;
	var p = new Fume.Relay(3).setName("p");
	var p2 = new Fume.Relay(p).setName("p2");
	var last;

	var sub = p2.subscribe(function(value) {
		if (!value.isReady() && !value.isDirty())
			last = value;
	});

	test.equals(last.value, 3);
	p.observe(p2);

	test.ok(last.isError());

	test.equals(last.code, "cycle_detected");

	p.observe(1);

	test.equals(last.value, 1);

	test.done();
};

exports.testStuff = function(test) {
	var b = new Fume.ValueBuffer();
	var b2 = new Fume.ValueBuffer();

	var a = new F.Relay("once");
	a.subscribe(b);
	a.observe("twice");
	a.subscribe(b2);
	a.observe("second twice");

	test.deepEqual(b.buffer, ["once", "twice", "second twice"]);
	test.deepEqual(b2.buffer, ["twice", "second twice"]);

	b.reset();
	b2.reset();
	var x = new F.Relay("never");
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
	test.done();
};

exports.testMultiply = function(test) {
	debugger;
	var b = new Fume.ValueBuffer();

	// testing basic function and atomicity
	x = new F.Relay(2);

	var z = F.multiply(x, x).subscribe(b);

	x.observe(3);

	test.deepEqual(b.buffer, [4,9]); //Note, no inbetween 6!

	x.observe(4);

	test.deepEqual(b.buffer, [4,9,16]);

	test.done();
};

exports.list1 = function(test) {
	var lb = new F.ValueBuffer();
	var lbe = new F.EventTypeBuffer();
	var e = new F.EventTypeBuffer();
	var l = new F.List();
	l.subscribe(e);
	l.length().subscribe(lb);
	l.length().subscribe(lbe);
	l.add(1);
	l.add(2);
	l.insert(0, 0);
	l.insert(2, 1.5);
	l.remove(1);
	l.set(2,4);
	test.deepEqual(l.toArray(), [0,1.5,4]);


	var b = new F.ValueBuffer();
	l.get(1).subscribe(b);
	test.deepEqual(b.buffer, [1.5]);
	l.set(1, 3);
	test.deepEqual(b.buffer, [1.5,3]);
	test.equal(l.get(0).get().value, 0);

	for(var i = 0; i < l.items.length; i++)
		test.equal(l.items[i].index, i);

	l.clear();
	test.deepEqual(l.toArray(),[]);
	test.deepEqual(lb.buffer,[1,2,3,4,3,0]);
	test.deepEqual(e.buffer, [
		"DIRTY", "CLEAR", "READY",
		"DIRTY", "INSERT", "READY",
		"DIRTY", "INSERT", "READY",
		"DIRTY", "INSERT", "READY",
		"DIRTY", "INSERT", "READY",
		"DIRTY", "REMOVE", "READY",
		"DIRTY", "UPDATE", "READY",
		"DIRTY", "UPDATE", "READY",
		"DIRTY", "CLEAR", "READY"
	]);
	test.deepEqual(lbe.buffer,[
		"DIRTY", "VALUE", "READY",
		"DIRTY", "VALUE", "READY",
		"DIRTY", "VALUE", "READY",
		"DIRTY", "VALUE", "READY",
		"DIRTY", "VALUE", "READY",
		"DIRTY", "VALUE", "READY"
	]);
	test.done();
};

exports.listMultiInsert = function(test) {
	var lb = new F.ValueBuffer();
	var lbe = new F.EventTypeBuffer();
	var e = new F.EventTypeBuffer();
	var l = new F.List();

	l.length().subscribe(lbe);
	l.subscribe(e);
	l.addAll([1,4]);
	l.insertAll(1, [2,3]);
	l.removeRange(2,2);

	test.deepEqual(l.toArray(), [1,2]);

	test.deepEqual(e.buffer, [
		"DIRTY", "CLEAR", "READY",
		"DIRTY", "INSERT", "INSERT", "READY",
		"DIRTY", "INSERT", "INSERT", "READY",
		"DIRTY", "REMOVE", "REMOVE", "READY"
	]);
	test.done();
};

exports.testDict = function(test) {
	var d = new F.Dict();

	var b = new F.ValueBuffer();
	d.get('b').subscribe(b);

	d.set('a', 3);
	d.set('b', 4);
	d.set('d', 0);
	d.extend({b:2, c:1});

	var c = new F.ValueBuffer();
	d.get('c').subscribe(c);

	d.remove('a');

	test.deepEqual(d.keys.toArray().sort(),['b','c','d']);
	test.deepEqual(d.toObject(), { b: 2, c: 1, d: 0});

	test.deepEqual(c.buffer, [1]);
	test.deepEqual(b.buffer, [undefined, 4, 2]);

	test.done();
};