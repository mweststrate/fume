/* jshint immed:true, latedef:true, newcap:true, browser:true, node:true */

var _ = require("lodash");
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
    isComplexEvent : function() {
        return this.type in { CLEAR : 1, INSERT : 1, REMOVE : 1, UPDATE : 1};
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
    */
    initialize : function() {
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
        Use this method to push a value to all observers of this stream

        @protected
        @param {Event} - event to be passed to the subscribers
    */
    out : function(value) {
        if (this.enableLogging)
            console.log(value);

        if (this.isStopped)
            fail(this + ": cannot perform 'next'; already stopped");
        for(var key in this.observers)
            this.observers[key].in(value);
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
    in : function(value) {
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
    Transformer transforms one stream into another stream, by passing Events trough the transform
    function.

    The transform function should have the signature transform(Observer, Event)

    @class
*/
var Transformer = Fume.Transformer = clutility(Stream, {

    initialize : function($super, stream, transformFunction){
        $super();

        if (transformFunction)
            this.transform = transformFunction;

        var self = this;
        this.sink = new AnonymousObserver(function(event){
            self.out(event);
        });

        stream = Stream.fromValue(stream);
        this.observing = stream;
        this.subscription = stream.subscribe(this);
    },

    in : function(event) {
        if (event.isStop())
            this.stop();
        else if (event.isDirty() || event.isReady())
            this.out(event);
        else
            this.transform(this.sink, event);
    },

    replay : function(observer) {
        observer.in(Event.dirty());
        var self = this;
        this.observing.replay(new AnonymousObserver(function(event) {
            if (!event.isDirty() && !event.isReady())
                self.transform(observer, event);
        }));
        observer.in(Event.ready());
    },

    transform : function(observer, event) {
        //stub implementation, just pass in the events
        observer.in(event);
    },

    stop : function($super) {
        $super();
        if (this.subscription) {
            this.subscription.dispose();
            this.subscription = null;
        }
    }
});

/**
    A relay is a stream that observes another stream. The stream which it is observing might change
    over time, by using the `observe` method.

    @class
*/
var Relay = Fume.Relay = clutility(Stream, {

    initialize : function($super, stream){
        $super();
        this.dirtyCount = 0;
        this.isReplaying = false; //for cycle detection

        this.observe(stream);
    },

    in : function(event) {
        if (!this.hasObservers())
            return;
        else if (event.isStop())
            this.stop();
        else
            this.out(event);
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

    observe : function(stream) {
        if (this.isStopped)
            fail(this + ": cannot perform 'observe', already stopped");

        stream = Stream.fromValue(stream);
        if (stream !== this.observing && !Constant.equals(stream, this.observing)) {
            if (this.subscription)
                this.subscription.dispose();

            this.observing = stream;
            this.subscription = stream.subscribe(this);
        }
    },

    stop : function($super) {
        $super();
        if (this.subscription) {
            this.subscription.dispose();
            this.subscription = null;
        }
    }
});

/**
    Merge takes multiple streams, and whenever a stream fires, and all input streams are ready again,
    it will combine the latest state of the input streams into an array, an emit that as new value.

    @class
*/
var Merge = Fume.Merge = clutility(Stream, {
    initialize : function($super, streams) {
        $super();
        this.inputStreams = _.map(streams, Stream.fromValue);
        this.inputDirtyCount = 0;
        this.inputStates = []; //last event per input

        this.inputObservers = _.map(this.inputStreams, function(stream, idx) {
            return new DisposableObserver(stream,  _.bind(this.in, this, idx));
        }, this);
    },
    in : function(inputIndex, event) {
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
                if all inputs are satisfied, apply the process function
            */
            if (this.inputDirtyCount === 0) {
                this.out(this.statesToEvent(this.inputStates));
                this.out(event);
            }
        }
        else if (event.isComplexEvent())
            this.inputStates[inputIndex] = Event.error("Complex events are not supported by Merge");
        else
            this.inputStates[inputIndex] = event;
    },
    replay : function(observer) {
        observer.in(Event.dirty());
        observer.in(this.statesToEvent(this.inputStates));
        observer.in(Event.ready());
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
    },
    stop : function($super) {
        _.forEach(this.inputObservers, function(observer) {
            observer.dispose();
        });
        $super();
    }
});

/**
    A primitve transformer takes a function which accepts native JS values and a bunch of streams.
    Based on the merge of the strams the function will be applied, and the return value of the function will be emitted.
*/
    var PrimitiveTransformer = Fume.PrimitiveTransformer = clutility(Transformer, {
    initialize : function($super, func, streams) {
        var self = this;
        this.simpleFunc = func;
        this.latestEvent = null;

        $super(new Merge(streams), null);
    },
    transform : function(observer, event) {
     try {
            var args = event.value;
            observer.in(this.latestEvent = Event.value(this.simpleFunc.apply(this, args)));
        } catch(e) { //TODO: is catch responsibility of primitive transformer? it is slow... or from the base transformer?
            debugger;
            observer.in(Event.error(e));
        }
    },
    replay : function(observer) {
        observer.in(Event.dirty());
        observer.in(this.latestEvent);
        observer.in(Event.ready());
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
            this.parent.out(Event.update(this.index, newValue, oldValue));

            this.parent.markReady(false);
        }
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
        this.markDirty(true);

        var item = new ChildItem(this, index, value);
        this.items.splice(index, 0, item);
        for (var i = index + 1; i < this.items.length; i++)
            this.items[i].index += 1;

        this.out(Event.insert(index, item.get()));
        this.lengthPipe.out(Event.value(this.items.length));

        this.markReady(true);
    },

    /**
        Updates the value at the specified index. This will replace any stream which is already in there

        @param {Integer} index - Index of the item to be updated. Should be positive and smaller than the length of the List
        @param {Any} value - the new value. Will be converted into a stream if necessary.
    */
    set : function(index, value) {
        this.items[index].set(value);
    },

    /**
        Removes the item at the specified index

        @param {Integer} index - Index of the item to be removed. Should be positive and smaller than the length of the List
    */
    remove : function(index) {
        this.markDirty(true);

        var item = this.items[index];
        this.items.splice(index, 1);
        for (var i = index ; i < this.items.length; i++)
            this.items[i].index -= 1;

        this.out(Event.remove(index));
        this.lengthPipe.out(Event.value(this.items.length));
        item.stop();

        this.markReady(true);
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
    },

    /**
        Returns a Stream to which the length of this list will be emitted, whenever it changes
    */
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

    /**
        Shorthand for inserting an item at the last position of this list.

        @see List#insert
    */
    add : function(value) {
        this.insert(this.items.length, value);
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