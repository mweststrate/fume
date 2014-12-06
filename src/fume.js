/* jshint immed:true, latedef:true, newcap:true, browser:true, node:true */

var _ = require("lodash");
var clutility = require("clutility");

/** @namespace Fume */
var Fume = Fume || {};

Fume.trace = false;

/** @namespace Fume.util */
Fume.util = {};

/**
Throws illegal state exception. Use this for code / state that should never occur

@method
@param {String} msg - (optional) additional details for this error
*/
var fail = Fume.util.fail = function(msg) {
	msg = msg || "This code shouldn't be triggered";
	throw new Error("IllegalStateException: " + msg);
};

/**
The Event class describes all event types that can be send through Fume streams.
In, for exampel RxJs there are just three types of events: `Next`, `Completed` and `Error`.
However, fume consists of many more event types, being:

### Control events

* dirty - the stream will be changed soon
* ready - the stream has sent all its changes and is stable again
* stop - this stream ends (similar to complete in RxJs)
* error - an error has occurred. Like in Bacon.js, and unlike RxJs. `error` will not end the stream.

### Value related events

* value(value) - a new value is sent through this stream. Similar to next in RxJs

### Complex structure (@see List or @see Dict) related events

* clear - reset all state / data of this structure
* listInsert(index, value) - a new item was added to a list at the specified index
* itemRemove(index) - the item at the specified index (key) was removed from the structure
* itemUpdate(index, value) - the value at the specified index / key was replaced with a new value

For each event type there is a static method that creates the event, for example:
`Event.insert(index, value)`, and there is instance function to check whether instance is a specific type of event.
For example: `this.isInsert()`

The index parameter should always be a positive integer (for Lists) or any string (for Dicts) that is a valid identifier.

@class
*/
var Event = Fume.Event = clutility({
	initialize : function(type, props) {
		this.type = type;
		if (props)
			_.extend(this, props);
	},
	isStop : function() {
		return this.type === "STOP";
	},
	isDirty : function() {
		return this.type === "DIRTY";
	},
	isReady : function() {
		return this.type === "READY";
	},
	isValue : function() {
		return this.type === "VALUE";
	},
	isError : function() {
		return this.type === "ERROR";
	},
	isClear : function() {
		return this.type === "CLEAR";
	},
	isInsert : function() {
		return this.type === "INSERT";
	},
	isRemove : function() {
		return this.type === "REMOVE";
	},
	isUpdate : function() {
		return this.type === "UPDATE";
	},
	isComplexEvent : function() {
		return this.type in { CLEAR : 1, INSERT : 1, REMOVE : 1, UPDATE : 1};
	},
	toString : function() {
		var res = {};
		for (var key in this) if (this.hasOwnProperty(key))
			res[key] = res[key] instanceof Object ? res[key].toString() : res[key];
		return JSON.stringify(res);
	}
});
Event.stop = function() {
	return new Event("STOP"); //Optimize: use single event instance
};
Event.dirty = function() {
	return new Event("DIRTY");
};
Event.ready = function() {
	return new Event("READY");
};
Event.value = function(value) {
	return new Event("VALUE", { value : value });
};
Event.error = function(code, error) {
	return new Event("ERROR", { code : code, error : error});
};
Event.clear = function() {
	return new Event("CLEAR");
};
Event.insert = function(index, value) {
	return new Event("INSERT", { index : index, value : value});
};
Event.remove = function(index, value) {
	return new Event("REMOVE", { index : index, value : value});
};
Event.update = function(index, value) {
	return new Event("UPDATE", { index : index, value : value });
};

/**
Stream is the heart of fume. A stream is an event emitter that can be observed by one or more Observers.
Stream is very similar to RxJs's Observable or Bacon.js's Stream.

A stream will always send one of the events as described by @see Event.

New observers can subscribe to the stream by using the `subscribe` method. (Similar to RxJs)

New values can be pushed by the stream to its observers by using the `out` method. (Similar to RxJs Observable.next).
For example: `this.out(Event.value(2));`

When a new observer registers, it will be send to the `replay` method. The replay has the opportunity to push the current
state of the stream to the observer. This is not required and depends on the character of the stream whether this should happen.

@class
*/
var Stream = Fume.Stream = clutility({

	/**
		Create a new stream.
	*/
	initialize : function() {
		this.isStopped = false;
		this.observersIdx = 0;
		this.observers = {};
		this.name = "STREAM";
	},

	/**
		Subscribes an observer to this stream.
		Observables should implement the 'in(event)' method.
		On subscribing, the current state of this stream can be pushed to the observable by invoking the `replay` function.

		@param {Observer} observer - Observer object that will receive the events. It is allowed to pass in a function as well.
		@param {any} ...boundArgs -  events that will passed with an 'in' call to the observer
		@returns {Disposable} - disposable object. Call the @see Fume.Disposable#dispose function to stop listening to this observer
	*/
	subscribe : function(observer, boundArgs) {
		boundArgs = _.tail(arguments, 1);

		if (this.isStopped)
			fail(this + ": cannot perform 'subscribe'; already stopped.");

		if (typeof observer === "function")
			observer = new AnonymousObserver(observer);

		this.replayForObserver(observer, boundArgs);

		this.observersIdx += 1;
		this.observers[this.observersIdx] = { observer: observer, args : boundArgs };

		var observing = this;
		return {
			observerId : this.observersIdx,
			isDisposed : false,
			dispose : function(){
				if (this.isDisposed)
					fail();
				this.isDisposed = true;
				observing.unsubcribe(this);
			}
		};
	},

	/**
		Called by the dispose function of any disposables returned by the subscribe method.
		@private
	*/
	unsubcribe : function(disposable) {
		 delete this.observers[disposable.observerId];
		 if (!this.hasObservers())
			this.stop();
	},

	/**
		@return {Boolean} - Returns whether any observers are listening to this observable
	*/
	hasObservers : function() {
		if (this.observers) for(var key in this.observers)
			return true;
		return false;
	},

	/**
		Makes sure that the observer is brought in to sync with any other observers, so that
		it correctly reflects the current state of this stream (whatever that means).
		Usually replay should start with sending the `Dirty` event and end with the `Ready` event.

		@param {Observer} observer Observer that should receives the initial state.
	*/
	replay : function(observer) {
		//stub
	},

	/**
	 * Replays this stream for a specific observer only
	 */
	replayForObserver : function(observer, boundArgs) {
		var observers = this.observers;
		this.observers = { tmp : { observer : observer, args : boundArgs } };
		this.replay();
		this.observers = observers;
	},

	/**
		Use this method to push a value to all observers of this stream

		@protected
		@param {Event} - event to be passed to the subscribers
	*/
	out : function(value) {
		this.trace("OUT: " + value);
		if (this.enableLogging)
			console.log(value);

		if (this.isStopped)
			fail(this + ": cannot perform 'next'; already stopped");
		for(var key in this.observers) {
			var o = this.observers[key];
			o.observer.in.apply(o.observer, [value].concat(o.args));
		}
	},

	log : function() {
		this.enableLogging = true;
		return this;
	},

	/*
		Stops this observable from emitting events.
		Will distribute the Stop event to all its subscribers
	*/
	stop : function() {
		if (this.isStopped)
			return;
		if (this.hasObservers())
			this.out(Event.stop());
		this.isStopped = true;
		this.observers = null;
	},

	setName : function(name) {
		this.name = name;
		return this;
	},

	trace : function(msg) {
		if (Fume.trace)
			console.log(this + ": " + msg);
	},

	toString : function() {
		return _.isFunction(this.name) ? this.name() : this.name;
	}
});

/**
Class / interface. An item that listens to a stream. For every event that is being send through a stream's `out` method,
the `in` method of this observer is invoked

@class
*/
var Observer = Fume.Observer = clutility({
	/**
		@param {Event} value - event that is being received by this observer.
	*/
	in : function(value, boundArgs) {
		//Just a stub
	}
});

/**
Class, or merely interface, that exposes a `dispose` function. Used to unsubscribe observers from a stream.

@class
*/
var Disposable = Fume.Disposable = clutility({
	dispose : function() {
		//stub
	}
});

/**
Utility class. Simple observer that is constructed by directly passing in the `in` method to the constructor.

Sample usage:

```javascript
Stream.subscribe(new AnonymousObserver(function(event) {
	//code
}));
```

@class
*/
var AnonymousObserver = Fume.AnonymousObserver = clutility(Observer, {
	/**
		@param {function(Event)} func - implementation of the `in` method of this Observer
	*/
	initialize : function(func) {
		if (func)
			this.in = func;
	}
});

/**
Utility class. Observer and Disposable that subscribes itself to a stream. This object can dispose itself from the stream.
@class
*/
var DisposableObserver = Fume.DisposableObserver = clutility(AnonymousObserver, {
	/**
		@param {Stream} stream - stream to listen to
		@param {function(Event)} func - (Optional) implementation of the `in` method
	*/
	initialize : function($super, stream, func) {
		$super(func);
		this.subscription = stream.subscribe(this);
	},
	/**
		Disposes this observer, it will no longer listen to its stream.
	*/
	dispose : function() {
		this.subscription.dispose();
	}
});

/**
	A Relay is a stream that observes other streams. The streams which it is observing might change. The default implementation just passes on all incoming events to the output stream.

	over time, by using the `observe` method, the set of streams the Relay listens to might be altered

	when events occur in one of the input streams, these are received in the `in` method, (which can be overriden). The in method will receive the event and an streamIndex parameter, to indicate form which stream the event was received.

	@class
*/
var Relay = Fume.Relay = clutility(Stream, {

	initialize : function($super, streams){
		$super();

		this.isSwitchingObservers = false;
		this.cycleDetected = false;

		this.inputStreams = [];
		this.subscriptions = [];
		this.observe(streams);
	},

	in : function(event, streamIndex) {
		this.out(event);
	},

	replay : function() {
		if (this.isSwitchingObservers)
			this.cycleDetected = true;
		else
			_.forEach(this.inputStreams, function(stream, i) {
				stream.replayForObserver(this, i);
			}, this);
	},

	observe : function(streams) {
		if (!_.isArray(streams))
			streams = [streams];

		if (this.isStopped)
			fail(this + ": cannot perform 'observe', already stopped");

		streams = _.map(streams, Stream.fromValue);

		//check whether none of the input streams were changed
		if (streams.length === this.inputStreams.length && _.every(this.inputStreams, function(value, index) {
			return streams[index] === value || Constant.equals(streams[index], value);
		})) {
			return;
		}

		this.isSwitchingObservers = true;
		_.forEach(this.subscriptions, function(sub) { sub.dispose(); });

		this.inputStreams = streams;
		this.subscriptions = _.map(streams, function(stream, index){ return stream.subscribe(this, index);}, this);

		if (this.cycleDetected) {
			this.cycleDetected = false;
			this.observe(new FumeError("cycle_detected", "Circular reference detected in '" + this.toString() + "'"));
		}
		this.isSwitchingObservers = false;
	},

	stop : function($super) {
		_.forEach(this.subscriptions, function(sub) { sub.dispose(); });
		this.subscriptions = [];
		$super();
	}
});

/**
	Merge takes multiple streams, and whenever a stream fires, and all input streams are ready again,
	it will combine the latest state of the input streams into an array, an emit that as new value.

	@class
*/
var LatestEventMerger = Fume.LatestEventMerger = clutility(Relay, {
	initialize : function($super, streams) {
		this.inputDirtyCount = 0;
		this.inputStates = new Array(streams.length);
		$super(streams);
	},
	in : function(event, inputIndex) {
		if (event.isStop())
			this.stop();
		else if (event.isDirty()) {
			if (this.inputDirtyCount === 0)
				this.out(event);
			this.inputDirtyCount += 1;
		}
		else if (event.isReady()) {
			this.inputDirtyCount -= 1;

			/*
				if all inputs are satisfied, and all streams have a value, apply the process function
			*/
			if (this.allStreamsReady()) {
				this.out(this.statesToEvent(this.inputStates));
				this.out(event);
			}
		}
		else if (event.isComplexEvent())
			this.inputStates[inputIndex] = Event.error("Complex events are not supported by LatestEventMerger");
		else
			this.inputStates[inputIndex] = event;
	},
	replay : function() {
		this.out(Event.dirty());
		if (this.allStreamsReady()) {
			this.out(this.statesToEvent(this.inputStates));
			this.out(Event.ready());
		}
	},
	allStreamsReady : function() {
		return this.inputDirtyCount === 0 && _.every(this.inputStates, function(e) { return !!e; });
	},
	statesToEvent : function(states) {
		var values = [];
		for (var i = 0; i < states.length; i++) {
			if (states[i].isError())
				return states[i];
			else
				values.push(states[i].value);
		}
		return Event.value(values);
	}
});

/**
 * Transform a stream into a new stream using a transform function. The transform function will receive as first argument
 * a sink which can be used to send events.
 *
 * The events stop, dirty and ready are handled automatically; stop will stop this stream as well, and dirty and ready will be pushed downstream
 *
 * For example the following example duplicates each insert event.
 *
 * stream.transform(function(sink, event) {
 *   	sink(event);
 * 		if (!event.isInsert())
 *   		sink(event);
 * });
 */
Stream.prototype.transform = function(func) {
	var relay = new Relay(this);
	var sink = relay.out.bind(relay);
	relay.in = function(event) {
		if (event.isStop())
			this.stop();
		else if (event.isDirty() || event.isReady())
			this.out(event);
		else
			func(sink, event);
	};
	return relay;
};

Fume.Let = clutility(Relay, {
	initialize : function($super, varname, value, expression) {
		this.varname = varname;
		this.value = value;
		this.expression = expression;
		$super(expression);
	},
	setClosure : function(closure) {
		this.closure = closure;
		this.value.setClosure && value.setClosure(closure);
		this.expression.setClosure && this.expression.setClosure(this);
	},
	resolve : function(varname) {
		if (this.varname == varname)
			return this.value;
		else
			return this.closure ? this.closure.resolve(varname) : new FumeError("Undefined: " + varname, "Variable with name '" + varname + "' is not in scope");
	}
});

Fume.Get = clutility(Relay, {
	hasClosure : false,
	initialize : function($super, varname) {
		this.varname = varname;
		$super();
	},
	setClosure : function(closure) {
		this.hasClosure = true;
		this.observe(closure.resolve(this.varname));
		this.out(Event.ready()); //to those already listening...
	},
	replay : function($super) {
		if (!this.hasClosure)
			this.out(Event.dirty());
		else
			$super();
	}
});

/**
	A primitve transformer takes a function which accepts native JS values and a bunch of streams.
	Based on the merge of the streams the function will be applied, and the return value of the function will be emitted.
*/
var PrimitiveTransformer = Fume.PrimitiveTransformer = clutility(Relay, {
	initialize : function($super, func, streams) {
		var self = this;
		this.simpleFunc = func;
		this.latestEvent = null;
		this.streams = streams;
		var self = this;

		$super(new LatestEventMerger(streams).transform(function(sink, event) {
			var args = event.value;
			sink(self.latestEvent = Event.value(self.simpleFunc.apply(this, args)));
		}));
	},
	replay : function() {
		this.out(Event.dirty());
		if (this.latestEvent) {
			this.out(this.latestEvent);
			this.out(Event.ready());
		}
	},
	setClosure : function(closure) {
		this.streams.forEach(function(stream) {
			stream.setClosure && stream.setClosure(closure);
		});
	}
});

/**
	A constant is a stream that is initialized by a single value and will not change over time.
	Each observer that subscribes to the constant will receive its initial value.

	@class
*/
var Constant = Fume.Constant = clutility(Fume.Stream, {
	/**
		@param {Any} value - The initial value of the constant.
	*/
	initialize : function($super, value) {
		$super();
		this.value = value;
	},
	replay : function() {
		this.out(Event.dirty());
		this.out(Event.value(this.value));
		this.out(Event.ready());
	},
	toString : function() {
		return "(" + this.value + ")";
	}
});

Constant.equals = function(left, right) {
	return left instanceof Constant && right instanceof Constant && left.value === right.value;
};

/**
 * FumeError is a constant that is used to indicate that an error occurred.
 * The FumeError class will emit `error` events.
 *
 * @class
 * @param  {String} code     Machine recognizable code of the error. Should not change over time
 * @param  {[type]} error    Description of the error
 */
var FumeError = Fume.FumeError = clutility(Fume.Stream, {
	initialize : function($super, code, error) {
		$super();
		this.code = code;
		this.error = error;
	},
	replay : function() {
		this.out(Event.dirty());
		this.out(Event.error(this.code, this.error));
		this.out(Event.ready());
	},
	toString : function() {
		return "FumeError(" + this.code + ", " + this.error  + ")";
	}
});


/**
	ChildItem is a Relay, contained by a complex object (list or dict). It has a notion of a parent position
	and when it starts observing a new stream, it will notify its parent so that the proper events can be triggered.

	@class
	@private
*/
var ChildItem = clutility(Relay, {
	initialize : function($super, parent, idx, initialValue) {
		this.parent = parent;
		this.index = idx;
		this.isStarting = true;
		$super(initialValue);
		this.isStarting = false;
	},
	observe : function($super, newValue) {
		var oldValue = this.get();
		newValue = Stream.fromValue(newValue);

		if (newValue === oldValue || Constant.equals(newValue, oldValue))
			return;

		if (this.isStarting)
			$super(newValue);
		else {
			this.parent.markDirty(false);

			$super(newValue);
			this.parent.out(Event.update(this.index, newValue));

			this.parent.markReady(false);
		}
	},
	set : function(newValue) {
		this.observe(newValue);
	},
	get : function() {
		return this.inputStreams[0];
	},
	toString : function() {
		return this.index + ":" + this.inputStreams[0].toString();
	}
});

/**
	A list presents an ordered set of values / streams and provides functions to manipulate the individual streams,
	but proved combined streams with special events as well.

	@class
*/
var List = Fume.List = clutility(Stream, {
	initialize : function($super) {
		$super();
		this.items = [];
		this.lengthPipe = new Stream();
	},

	/**
		Inserts a new item to this list at the specified index.

		@param {Integer} index - Position where the item should be inserted. Should be positive, and smaller or equal to the length of this list
		@param {Any} value - Value to be inserted at the specified position. Will be converted to a Stream if necessary.
	*/
	insert : function(index, value) {
		return this.insertAll(index, [value]);
	},

	/**
		Updates the value at the specified index. This will replace any stream which is already in there

		@param {Integer} index - Index of the item to be updated. Should be positive and smaller than the length of the List
		@param {Any} value - the new value. Will be converted into a stream if necessary.
	*/
	set : function(index, value) {
		this.items[index].set(value);
		return this;
	},

	/**
		Removes the item at the specified index

		@param {Integer} index - Index of the item to be removed. Should be positive and smaller than the length of the List
	*/
	remove : function(index) {
		return this.removeRange(index, 1);
	},

	removeRange : function(index, amount) {
		this.markDirty(true);

		this.items.splice(index, amount).forEach(function(item){
			this.out(Event.remove(item.index));
			item.stop();
		}, this);

		for (var i = index; i < this.items.length; i++)
			this.items[i].index -= amount;

		this.lengthPipe.out(Event.value(this.items.length));

		this.markReady(true);
		return this;
	},

	/**
		Removes all items from this list
	*/
	clear : function() {
		if (this.length === 0)
			return;

		this.markDirty(true);

		for (var i = this.items.length -1; i >= 0; i--)
			this.items[i].stop();
		this.items = [];

		this.out(Event.clear());
		this.lengthPipe.out(Event.value(0));

		this.markReady(true);
		return this;
	},

	/**
		Returns a Stream to which the length of this list will be emitted, whenever it changes
	*/
	length : function() {
		return this.lengthPipe;
	},

	replay : function() {
		this.out(Event.dirty());
		this.out(Event.clear());
		for(var i = 0, l = this.items.length; i < l; i++)
			this.out(Event.insert(i, this.items[i].get()));
		this.out(Event.ready());
		return this;
	},

	/**
		Shorthand for inserting an item at the last position of this list.

		@see List#insert
	*/
	add : function(value) {
		return this.insert(this.items.length, value);
	},

	addAll : function(values) {
		return this.insertAll(this.items.length, values);
	},

	insertAll : function(index, values) {
		this.markDirty(true);

		//create and insert the items
		var toInsert = values.map(function(value, i) {
			var child = new ChildItem(this, index + i, value);
			this.out(Event.insert(index + i, child.get()));
			return child;
		}, this);
		this.items.splice.apply(this.items, [index, 0].concat(toInsert));

		//update indexes
		for (var i = index + values.length; i < this.items.length; i++)
			this.items[i].index += values.length;

		this.lengthPipe.out(Event.value(this.items.length));
		this.markReady(true);
		return this;
	},

	/**
		Returns the Stream which is stored at the specified index. The stream will be bound to the value which is
		*currently* at the specified index.

		@param {Integer} index - Stream to be requested. Should be positive and smaller than the length of this list.
	*/
	get : function(index) {
		return this.items[index];
	},

	toArray : function() {
		var res = [];
		_.forEach(this.items, function(x){
			res.push(x.get().value);
		});
		return res;
	},

	stop : function($super) {
		this.clear();
		this.lengthPipe.stop();
		_.forEach(this.items, function(item) {
			item.stop();
		});
		$super();
	},

	markDirty : function(includeLength) {
		this.out(Event.dirty());
		if (includeLength)
			this.lengthPipe.out(Event.dirty());
		return this;
	},

	markReady : function(includeLength) {
		this.out(Event.ready());
		if (includeLength)
			this.lengthPipe.out(Event.ready());
		return this;
	},

	toString : function() {
		return "[" + this.toArray().join(",") + "]";
	}
});

var Dict = Fume.Dict = clutility(Stream, {
	initialize : function($super) {
		$super();
		this.items = {};
		this.futures = {};
		this.keys = new List();
	},

	/**
		Updates the value at the specified key. This will replace any stream which is already in there

		@param {String} key - Key of the item to be updated.
		@param {Any} value - the new value. Will be converted into a stream if necessary.
	*/
	set : function(key, value) {
		var o = {}; o[key] = value;
		return this.extend(o);
	},

	extend : function(valueObject) {
		this.markDirty(true);

		if (valueObject instanceof Dict)
			return this.extend(valueObject.items);
		else if (!_.isObject(valueObject))
			throw new Error("Dict.extend expected plain Object or dict");
		for (var key in valueObject) if (valueObject.hasOwnProperty(key)) {
			if (!key || !_.isString(key))
				throw new Error("Key should be a valid string, got: " + key);
			var value = valueObject[key];

			//new key
			if (!this.items[key]) {
				if (this.futures[key]) {
					this.items[key] = this.futures[key];
					delete this.futures[key];
					this.items[key].set(value);
				}
				else {
					this.items[key] = new ChildItem(this, key, value);
				}
				this.out(Event.update(key, this.items[key].get()));
				this.keys.add(key);
			}

			//existing key
			else
				this.items[key].set(value);
		}

		this.markDirty(false);
		return this;
	},

	/**
		Removes the item at the specified key
	*/
	remove : function(key) {
		return this.reduce([key]);
	},

	reduce : function(keys) {
		this.markDirty(true);

		keys.forEach(function(key){
			if (this.items[key]) {
				var child = this.items[key];
				child.observe(undefined);
				if (child.hasObservers())
					this.futures[key] = child;
				else
					child.stop();
				delete this.items[key];
				this.keys.remove(key);
			}
		}, this);

		this.markReady(true);
		return this;
	},

	/**
		Removes all items from this Dict
	*/
	clear : function() {
		if (this.length === 0)
			return;

		this.markDirty(true);

		//Optimization: supress all events introduced by this:...
		this.reduce(this.keys.toArray());

		this.out(Event.clear());
		this.keys.clear();

		this.markReady(true);
		return this;
	},

	replay : function() {
		this.out(Event.dirty());
		this.out(Event.clear());
		for(var key in this.items)
			this.out(Event.update(key, this.items[key].get()));
		this.out(Event.ready());
		return this;
	},

	/**
		Returns the Stream which is stored at the specified key. The stream will be bound to the value which is
		now or in in the future at te specified key. This means that it is possible to observe keys which are not defined yet

		@param {Integer} key
	*/
	get : function(key) {
		if (!key || !_.isString(key))
			throw new Error("Key should be a valid string, got: " + key);
		else if (this.items[key])
			return this.items[key];
		else if (this.futures[key])
			return this.futures[key];
		else
			return this.futures[key] = new ChildItem(this, key, undefined);
	},

	/*
		Returns a stream of booleans that indicates whether the specified key is in use
	 */
	has : function(key) {
		return this.keys.contains(key);
	},

	toObject : function() {
		var res = {};
		for (var key in this.items)
			res[key] = this.items[key].get().value;
		return res;
	},

	stop : function($super) {
		this.clear();
		this.keys.clear();
		$super();
	},

	markDirty : function(includeKeys) {
		this.out(Event.dirty());
		if (includeKeys)
			this.keys.markDirty(true);
		return this;
	},

	markReady : function(includeKeys) {
		this.out(Event.ready());
		if (includeKeys)
			this.keys.markReady(true);
		return this;
	},

	toString : function() {
		return "{" + this.keys.map(function(key){
			return key + ": " + this.items[key].get().value;
		}, this).join(",") + "}";
	}
});

Stream.fromValue = function(value) {
	if (value instanceof Stream)
		return value;
	if (_.isArray(value)) {
		var l = new List();
		l.addAll(value);
		return l;
	}
	if (_.isObject(value)) {
		var d = new Dict();
		d.extend(value);
		return d;
	}

	return new Constant(value); //TODO: error, function...
};

Stream.asDict = function(stream) { //Or Dict.fromStream..
	//TODO:
};

Stream.asList = function(stream) { //Or List.fromStream..
	//TODO:
};

Fume.multiply = function(left, right) {
	return new PrimitiveTransformer(function(x, y) {
		return x * y;
	}, [left, right]);
};

Fume.ValueBuffer = clutility({
	initialize : function() {
		this.reset();
	},
	in : function(x) {
		if (x.isValue())
			this.buffer.push(x.value);
		else if (x.isError())
			this.buffer.push(x);
	},
	reset : function() {
		this.buffer = [];
		return this;
	}
});

Fume.EventTypeBuffer = clutility(Fume.ValueBuffer, {
	in : function(x) {
		this.buffer.push(x.type);
	}
});

module.exports = Fume;