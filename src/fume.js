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

Observable.fromValue = function(value) {
    if (value instanceof Observable)
        return value;
    return new Constant(value); //TODO: list, record, error, function...
};

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
        this.sink = _.bind(this.next, this); //sink that is used by process to push values to subsribers
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
    process : function(sink, inputs){

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
        this.process(_.bind(observer.onNext, observer), states);

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
    process : function(sink, inputs) {
        var hasError = false;
        args = [];
        for(var i = 0; i < inputs.length; i++) {
            var event = inputs[i];
            if (event.isError()) {
                sink(event);
                hasError = true;
                break;
            }
            else if (!event.isValue())
                fail("PrimitiveTransformer only supports primitive values as value " + this + ", got: " + event);
            args[i] = event.value;
        }
        if (!hasError)
            sink(Event.Value(this.simpleFunction.apply(this, args)));
    }
});

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
    }
});


/*
    Observable.transform = transform with unshift this.

    function transform(args, func) {
        var innerResult = new Variable;

        var innerArgs = args.accumelateEvents();
        innerArgs.map(arg, idx) {
            var disp = args.subscribe(function(changes) {
                innerResult.markUnstable();
                //wait for all args to be stable; combineLatest

                apply func
                innerResult.markStable();
            })

            innerResult.registerDisposable(disp);
        }

        return innerResult
        .distinctUntilChanged
        .accumelateEvents()
        .detectCycles()
    }
*/


/**
    An observable that, between the dirty and stable state, queues and optimizes all incoming events, by
    stripping out all events that are shadowed by a later event.

    Fires all queued events just before becoming stable.
*/
Fume.OptimizingPipe = null;

/**
    An observable that accepts multiple incoming streams, and zips them into a single stream that only fires when
    either all input streams are stable or one stream has an error and is stable
*/
Fume.SyncingStream = null;
/*
Fume.Transformer = clutility({
    initialize : function($super, func, //args//) {
        $super();
        /* Pseudo:
        inputargs = arguments.slice(2);
        optimizedArgs = _.map(inputargs, function(arg) {
            return new Fume.OptimizingStream(arg);
        });
        syncedArgs = new Fume.SyncingStream(optimizedArgs);

        result = syncedArgs.map(function(x) {
            if (isError(x) || isDirty(x) || isStable(x))
                return x;
            else
                return func.apply(x); //note, x is zipped array of arts
        });
        this.subscribeTo(result);
    }
});
*/

Fume.multiply = clutility(Fume.PrimitiveTransformer, {
    initialize : function($super, left, right) {
        $super(function(x, y) {
            return x * y;
        }, [left, right]);
    }
});


module.exports = Fume;