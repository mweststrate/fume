/* jshint immed:true, latedef:true, newcap:true, browser:true, node:true */

var _ = require("lodash");
var Rx  = require("rx");
var clutility = require("clutility");

/** @namespace Fume */
var Fume = Fume || {};

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
    toString : function() {
        return JSON.stringify(this);
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
Event.update = function(index, value, oldvalue) {
    return new Event("UPDATE", { index : index, value : value, oldvalue : oldvalue });
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

        @param {Boolean} autoClose - automatically stop this observer if the last observer has left
    */
    initialize : function(autoClose) {
        this.autoClose = autoClose;
        this.isStopped = false;
        this.observersIdx = 0;
        this.observers = {};
    },

    /**
        Subscribes an observer to this stream.
        Observables should implement the 'in(event)' method.
        On subscribing, the current state of this stream can be pushed to the observable by invoking the `replay` function.

        @param {Observer} observer - Observer object that will receive the events. It is allowed to pass in a function as well.
        @returns {Disposable} - disposable object. Call the @see Fume.Disposable#dispose function to stop listening to this observer
    */
    subscribe : function(observer) {
        if (this.isStopped)
            fail(this + ": cannot perform 'subscribe'; already stopped.");

        if (typeof observer === "function")
            observer = new AnonymousObserver(observer);

        this.replay(observer);

        this.observersIdx += 1;
        this.observers[this.observersIdx] = observer;

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
         if (this.autoClose && !this.hasObservers())
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
        Use this method to push a value to all observers of this stream

        @protected
        @param {Event} - event to be passed to the subscribers
    */
    out : function(value) {
        if (this.isStopped)
            fail(this + ": cannot perform 'next'; already stopped");
        for(var key in this.observers)
            this.observers[key].in(value);
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
    }
});

var Disposable = Fume.Disposable = clutility({
    dispose : function() {
        //stub
    }
});

var Observer = Fume.Observer = clutility({
    in : function(value) {
        //Just a stub
    }
});

var Pipe = Fume.Pipe = clutility(Stream, {

    initialize : function($super, observable, autoClose){
        $super(autoClose === false ? false : true);

        observable = Stream.fromValue(observable);
        this.dirtyCount = 0;
        this.observing = observable;
        this.subscription = observable.subscribe(this);
        this.isReplaying = false; //for cycle detection
    },

    in : function(event) {
        if (!this.hasObservers()) //Optimization
            return;

        if (event.isStop())
            this.stop();
        else if (event.isDirty()) {
            if (this.dirtyCount === 0)
                this.out(event); //push dirty
            this.dirtyCount += 1;
        }
        else if (event.isReady()) {
            this.dirtyCount -= 1;
            if (this.dirtyCount === 0)
                this.out(event); //push ready
        }
        else {
            this.out(event);
        }
    },

    stop : function($super) {
        $super();
        if (this.subscription) {
            this.subscription.dispose();
            this.subscription = null;
        }
    },

    replay : function(observer) {
        if (this.isReplaying) {
            //replay() is called before the observer is registered using subscribe,
            //so we can push the error without introducing unendless recursion
            observer.out(Event.error("cycle_detected", "Detected cycle in " + this));
            return;
        }

        this.isReplaying = true;
        this.observing.replay(observer);
        this.isReplaying = false;
    },

    observe : function(observable) {
        if (this.isStopped)
            fail(this + ": cannot perform 'observe', already stopped");

        observable = Stream.fromValue(observable);
        if (observable != this.observing && !Constant.equals(observable, this.observing)) {
            this.subscription.dispose();

            this.observing = observable;
            this.subscription = observable.subscribe(this);
        }
    }
});

var Constant = Fume.Constant = clutility(Fume.Stream, {
    initialize : function($super, value) {
        $super(false);
        this.value = value;
    },
    replay : function(observer) {
        observer.in(Event.dirty());
        observer.in(Event.value(this.value));
        observer.in(Event.ready());
    },
    toString : function() {
        return "(" + this.value + ")";
    }
});

Constant.equals = function(left, right) {
    return left instanceof Constant && right instanceof Constant && left.value === right.value;
};

var AnonymousObserver = Fume.AnonymousObserver = clutility(Observer, {
    initialize : function(func) {
        if (func)
            this.in = func;
    }
});

var DisposableObserver = Fume.DisposableObserver = clutility(AnonymousObserver, {
    initialize : function($super, observable, func) {
        $super(func);
        this.subscription = observable.subscribe(this);
    },
    dispose : function() {
        this.subscription.dispose();
    }
});

var Transformer = Fume.Transformer = clutility(Stream, {
    initialize : function($super, observables) {
        $super(true);
        this.inputObservables = _.map(observables, Stream.fromValue);
        this.inputDirtyCount = 0;
        this.inputStates = []; //last event per input

        //observer that pushes new events to our own observers
        var self = this;
        this.sink = new AnonymousObserver(function(value) {
            self.out(value);
        });

        this.inputObservers = _.map(this.inputObservables, function(observable, idx) {
            return new DisposableObserver(observable,  _.bind(this.in, this, idx));
        }, this);
    },
    in : function(inputIndex, event) {
        //todo: event should only be dirty, clean, error or value? what about stop?
        if (event.isDirty()) {
            if (this.inputDirtyCount === 0)
                this.out(event);
            this.inputDirtyCount += 1;
        }
        else if (event.isReady()) {
            this.inputDirtyCount -= 1;

            /*
                if all inputs are satisfied, apply the process function
            */
            if (this.inputDirtyCount === 0) {
                this.process(this.sink, this.inputStates);
                this.out(event); //ready
            }
        }
        else {
            //TODO: is it correct that only the last event is processed
            this.inputStates[inputIndex] = event;
        }
    },
    process : function(observer, inputs){

    },
    replay : function(observer) {
        observer.in(Event.dirty());
        /*
            replay all inputs, save the state
        */
        var states = [];
        _.forEach(this.inputObservables, function(observable, idx) {
            states[idx] = [];
            observable.replay(new AnonymousObserver(function(event){
                if (!event.isDirty() && !event.isReady())
                    states[idx] = event;
            }));
        });

        /*
            apply process on the inputs
        */
        this.process(observer, states);

        observer.in(Event.ready());
    },
    stop : function($super) {
        _.forEach(this.inputObservers, function(observer) {
            observer.dispose();
        });
        $super();
    }
});

var PrimitiveTransformer = Fume.PrimitiveTransformer = clutility(Transformer, {
    initialize : function($super, func, observables) {
        this.simpleFunction = func;
        $super(observables);
    },
    process : function(observer, inputs) {
        var hasError = false;
        args = [];
        for(var i = 0; i < inputs.length; i++) {
            var event = inputs[i];
            if (event.isError()) {
                observer.in(event);
                hasError = true;
                break;
            }
            else if (!event.isValue())
                fail("PrimitiveTransformer only supports primitive values as value " + this + ", got: " + event);
            args[i] = event.value;
        }
        if (!hasError)
            observer.in(Event.value(this.simpleFunction.apply(this, args)));
    }
});

var ChildItem = clutility(Pipe, {
    initialize : function($super, parent, idx, initialValue) {
        this.parent = parent;
        this.index = idx;
        $super(initialValue, false);
    },
    observe : function($super, newValue) {
        var oldValue = this.get();
        newValue = Stream.fromValue(newValue);

        if (newValue === oldValue || Constant.equals(newValue, oldValue))
            return;

        this.parent.markDirty(false);

        $super(newValue);
        this.parent.out(Event.update(this.index, newValue, oldValue));

        this.parent.markReady(false);
    },
    set : function(newValue) {
        this.observe(newValue);
    },
    get : function() {
        return this.observing;
    },
    toString : function() {
        return this.index + ":" + this.observing.toString();
    }
});

var List = Fume.List = clutility(Stream, {
    initialize : function($super) {
        $super(false);
        this.items = [];
        this.lengthPipe = new Stream(false);
    },

    insert : function(idx, value) {
        this.markDirty(true);

        var item = new ChildItem(this, idx, value);
        this.items.splice(idx, 0, item);
        for (var i = idx + 1; i < this.items.length; i++)
            this.items[i].index += 1;

        this.out(Event.insert(idx, item.get()));
        this.lengthPipe.out(Event.value(this.items.length));

        this.markReady(true);
    },

    set : function(idx, value) {
        this.items[idx].set(value);
    },

    remove : function(idx) {
        this.markDirty(true);

        var item = this.items[idx];
        this.items.splice(idx, 1);
        for (var i = idx ; i < this.items.length; i++)
            this.items[i].index -= 1;

        this.out(Event.remove(idx));
        this.lengthPipe.out(Event.value(this.items.length));
        item.stop();

        this.markReady(true);
    },

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
    },

    length : function() {
        return this.lengthPipe;
    },

    replay : function(observer) {
        observer.in(Event.dirty());
        observer.in(Event.clear());
        for(var i = 0, l = this.items.length; i < l; i++)
            observer.in(Event.insert(i, this.items[i].get()));
        observer.in(Event.ready());
    },

    add : function(value) {
        this.insert(this.items.length, value);
    },

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
        this.lengthPipe.clear();
        _.forEach(this.items, function(item) {
            item.stop();
        });
        $super();
    },

    markDirty : function(includeLength) {
        this.out(Event.dirty());
        if (includeLength)
            this.lengthPipe.out(Event.dirty());
    },

    markReady : function(includeLength) {
        this.out(Event.ready());
        if (includeLength)
            this.lengthPipe.out(Event.ready());
    },

    toString : function() {
        return "[" + this.toArray().join(",") + "]";
    }
});

Stream.fromValue = function(value) {
    if (value instanceof Stream)
        return value;
    return new Constant(value); //TODO: list, record, error, function...
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