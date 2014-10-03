/* jshint immed:true, latedef:true, newcap:true, browser:true, node:true */

var _ = require("lodash");
var Rx  = require("rx");
var clutility = require("clutility");

//
// Set up namespaces
//

var Fume = Fume || {};

//
// Utilties
//
Fume.util = {};

var fail = Fume.util.fail = function(msg) {
    msg = msg || "This code shouldn't be triggered";
    throw new Error("IllegalStateException: " + msg);
};


//
// Events
//

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
    isListInsert : function() {
        return this.type === "INSERT";
    },
    isItemRemove : function() {
        return this.type === "REMOVE";
    },
    isItemUpdate : function() {
        return this.type === "UPDATE";
    },
    toString : function() {
        return JSON.stringify(this);
    }
});
Event.Stop = function() {
    return new Event("STOP"); //Optimize: use single event instance
};
Event.Dirty = function() {
    return new Event("DIRTY");
};
Event.Ready = function() {
    return new Event("READY");
};
Event.Value = function(value) {
    return new Event("VALUE", { value : value });
};
Event.Error = function(code, error) {
    return new Event("ERROR", { code : code, error : error});
};
Event.Clear = function() {
    return new Event("CLEAR");
};
Event.ListInsert = function(index, value) {
    return new Event("INSERT", { index : index, value : value});
};
Event.ItemRemove = function(index, value) {
    return new Event("REMOVE", { index : index, value : value});
};
Event.ItemUpdate = function(index, value, oldvalue) {
    return new Event("UPDATE", { index : index, value : value, oldvalue : oldvalue });
};

/**
    Observable is a stream that might push values to all its subscribers until the Fume.Event.Stop is propagated.

*/
var Observable = Fume.Observable = clutility({

    /*
        Create a new observable.
        @param {Boolean} autoClose: automatically stop this observer if the last observable has left
    */
    initialize : function(autoClose) {
        this.autoClose = autoClose;
        this.isStopped = false;
        this.observersIdx = 0;
        this.observers = {};
    },

    /*
        Subscribes an observer to this observable
        observables should implement the 'onNext(value)' method.
        On subscribing, the current state of this (to be determined by @see getState), will be pushed to the observable

        @param {Observer} observer. Observer object that will receive the events. It is accepted to pass in a function as well.
        @returns {Disposable} disposable object. Call the @see Fume.Disposable#dispose function to stop listening to this observer
    */
    subscribe : function(observer) {
        if (this.isStopped)
            fail(this + ": cannot perform 'subscribe'; already stopped.");

        if (typeof observer === "function")
            observer = { onNext : observer };

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

    /*
        @private
    */
    unsubcribe : function(disposable) {
         delete this.observers[disposable.observerId];
         if (this.autoClose && !this.hasObservers())
            this.stop();
    },

    /*
        Returns whether any observers are listening to this observable
    */
    hasObservers : function() {
        if (this.observers) for(var key in this.observers)
            return true;
        return false;
    },

    /*
        Returns the current state of this observer in as few events as possible.
        When a new observer subscribes to this observable, the current state will be pushed
        to the observer, to get it in sync with all other observers.

        @param {Observer} observer Observer that should receives the initial state.
    */
    replay : function(observer) {
        //sub
    },

    /*
        @private
        Use this method to push a value to all observers of this observable
    */
    next : function(value) {
        if (this.isStopped)
            fail(this + ": cannot perform 'next'; already stopped");
        for(var key in this.observers)
            this.observers[key].onNext(value);
    },

    /*
        Stops this observable from emitting events.
        Will distribute the Stop event to all its subscribers
    */
    stop : function() {
        if (this.isStopped)
            return;
        if (this.hasObservers())
            this.next(Event.Stop());
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
    onNext : function(value) {
        //Just a stub
    }
});

var Pipe = Fume.Pipe = clutility(Observable, {

    initialize : function($super, observable, autoClose){
        $super(autoClose === false ? false : true);

        observable = Observable.fromValue(observable);
        this.dirtyCount = 0;
        this.observing = observable;
        this.subscription = observable.subscribe(this);
        this.isReplaying = false; //for cycle detection
    },

    onNext : function(event) {
        if (!this.hasObservers()) //Optimization
            return;

        if (event.isStop())
            this.stop();
        else if (event.isDirty()) {
            if (this.dirtyCount === 0)
                this.next(event); //push dirty
            this.dirtyCount += 1;
        }
        else if (event.isReady()) {
            this.dirtyCount -= 1;
            if (this.dirtyCount === 0)
                this.next(event); //push ready
        }
        else {
            this.next(event);
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
            observer.next(Event.Error("cycle_detected", "Detected cycle in " + this));
            return;
        }

        this.isReplaying = true;
        this.observing.replay(observer);
        this.isReplaying = false;
    },

    observe : function(observable) {
        if (this.isStopped)
            fail(this + ": cannot perform 'observe', already stopped");

        observable = Observable.fromValue(observable);
        if (observable != this.observing && !Constant.equals(observable, this.observing)) {
            this.subscription.dispose();

            this.observing = observable;
            this.subscription = observable.subscribe(this);
        }
    }
});

var Constant = Fume.Constant = clutility(Fume.Observable, {
    initialize : function($super, value) {
        $super(false);
        this.value = value;
    },
    replay : function(observer) {
        observer.onNext(Event.Dirty());
        observer.onNext(Event.Value(this.value));
        observer.onNext(Event.Ready());
    }
});

Constant.equals = function(left, right) {
    return left instanceof Constant && right instanceof Constant && left.value === right.value;
};

var AnonymousObserver = Fume.AnonymousObserver = clutility(Observer, {
    initialize : function(onNext) {
        if (onNext)
            this.onNext = onNext;
    }
});

var DisposableObserver = Fume.DisposableObserver = clutility(AnonymousObserver, {
    initialize : function($super, observable, onNext) {
        $super(onNext);
        this.subscription = observable.subscribe(this);
    },
    dispose : function() {
        this.subscription.dispose();
    }
});

var Transformer = Fume.Transformer = clutility(Observable, {
    initialize : function($super, observables) {
        $super(true);
        this.inputObservables = _.map(observables, Observable.fromValue);
        this.inputDirtyCount = 0;
        this.inputStates = []; //last event per input

        //observer that pushes new events to our own observers
        var self = this;
        this.sink = new AnonymousObserver(function(value) {
            self.next(value);
        });

        this.inputObservers = _.map(this.inputObservables, function(observable, idx) {
            return new DisposableObserver(observable,  _.bind(this.onNext, this, idx));
        }, this);
    },
    onNext : function(inputIndex, event) {
        //todo: event should only be dirty, clean, error or value? what about stop?
        if (event.isDirty()) {
            if (this.inputDirtyCount === 0)
                this.next(event);
            this.inputDirtyCount += 1;
        }
        else if (event.isReady()) {
            this.inputDirtyCount -= 1;

            /*
                if all inputs are satisfied, apply the process function
            */
            if (this.inputDirtyCount === 0) {
                this.process(this.sink, this.inputStates);
                this.next(event); //ready
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
        observer.onNext(Event.Dirty());
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

        observer.onNext(Event.Ready());
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
                observer.onNext(event);
                hasError = true;
                break;
            }
            else if (!event.isValue())
                fail("PrimitiveTransformer only supports primitive values as value " + this + ", got: " + event);
            args[i] = event.value;
        }
        if (!hasError)
            observer.onNext(Event.Value(this.simpleFunction.apply(this, args)));
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
        newValue = Observable.fromValue(newValue);

        if (newValue === oldValue || Constant.equals(newValue, oldValue))
            return;

        this.parent.markDirty(false);

        $super(newValue);
        this.parent.next(Event.ItemUpdate(this.index, newValue, oldValue));

        this.parent.markReady(false);
    },
    set : function(newValue) {
        this.observe(newValue);
    },
    get : function() {
        return this.observing;
    }
});

var List = Fume.List = clutility(Observable, {
    initialize : function($super) {
        $super(false);
        this.items = [];
        this.lengthPipe = new Observable(false);
    },

    insert : function(idx, value) {
        this.markDirty(true);

        var item = new ChildItem(this, idx, value);
        this.items.splice(idx, 0, item);
        for (var i = idx + 1; i < this.items.length; i++)
            this.items[i].index += 1;

        this.next(Event.ListInsert(idx, item.get()));
        this.lengthPipe.next(Event.Value(this.items.length));

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

        this.next(Event.ItemRemove(idx));
        this.lengthPipe.next(Event.Value(this.items.length));
        item.stop();

        this.markReady(true);
    },

    clear : function() {
        this.markDirty(true);

        for (var i = this.items.length -1; i >= 0; i--)
            this.items[i].stop();
        this.items = [];

        this.next(Event.Clear());
        this.lengthPipe.next(Event.Value(0));

        this.markReady(true);
    },

    length : function() {
        return this.lengthPipe;
    },

    replay : function(observer) {
        observer.onNext(Event.Dirty());
        observer.onNext(Event.Clear());
        for(var i = 0, l = this.items.length; i < l; i++)
            observer.onNext(Event.ListInsert(i, this.items[i].get()));
        observer.onNext(Event.Ready());
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
        this.next(Event.Dirty());
        if (includeLength)
            this.lengthPipe.next(Event.Dirty());
    },

    markReady : function(includeLength) {
        this.next(Event.Ready());
        if (includeLength)
            this.lengthPipe.next(Event.Ready());
    },

    toString : function() {
        return "[" + this.toArray().join(",") + "]";
    }
});

Observable.fromValue = function(value) {
    if (value instanceof Observable)
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
    onNext : function(x) {
        if (x.isValue())
            this.buffer.push(x.value);
    },
    reset : function() {
        this.buffer = [];
        return this;
    }
});

Fume.EventTypeBuffer = clutility(Fume.ValueBuffer, {
    onNext : function(x) {
        this.buffer.push(x.type);
    }
});

module.exports = Fume;