var Fume = require("./../src/fume.js");
var F = Fume;
var expect = F.util.expect;
var Event = Fume.Event;

exports.testLetGet = function(test) {
	var x = new Fume.Let('x', 3, new Fume.Get('x'));
	var b = new Fume.ValueBuffer();
	var e = new F.EventTypeBuffer();
	x.subscribe(b);
	x.subscribe(e);
	test.deepEqual(b.buffer, [3]);
	test.deepEqual(e.buffer, ["DIRTY", "VALUE", "READY"]);
	test.done();
};


exports.testLetGetFail = function(test) {
	var x = new Fume.Let('x', 3, new Fume.Get('y'));
	var b = new Fume.ValueBuffer();
	var e = new F.EventTypeBuffer();
	x.subscribe(b);
	x.subscribe(e);
	setTimeout(function() {
		test.deepEqual(b.buffer, [{ type: 'ERROR',
	    	code: 'Undefined: y',
	    	error: 'Variable with name \'y\' is not in scope' } ]);
		test.deepEqual(e.buffer, ["DIRTY", "DIRTY", "ERROR", "READY", "READY"]);
		test.done();
	}, 100);
};


exports.testLetGetVar = function(test) {
	var y = new Fume.Relay(3);
	var x = new Fume.Let('x', y, new Fume.Get('x'));
	var b = new Fume.ValueBuffer();
	var e = new F.EventTypeBuffer();

	y.observe(4);

	y.observe(5);
	x.subscribe(b);
	x.subscribe(e);

	y.observe(6);
	test.deepEqual(b.buffer, [5,6]);
	test.deepEqual(e.buffer, ["DIRTY", "VALUE", "READY", "DIRTY", "VALUE", "READY"]);
	test.done();
};

exports.testLetGetVarMul = function(test) {
	var y = new Fume.Relay(3);
	var x = new Fume.Let('x', y, Fume.multiply(new Fume.Get('x'), new Fume.Get('x')));
	var b = new Fume.ValueBuffer();
	var e = new F.EventTypeBuffer();

	y.observe(4);

	y.observe(5);
	x.subscribe(b);
	x.subscribe(e);

	y.observe(6);
	test.deepEqual(b.buffer, [25,36]);
	test.deepEqual(e.buffer, ["DIRTY", "VALUE", "READY", "DIRTY", "VALUE", "READY"]);
	test.done();
};