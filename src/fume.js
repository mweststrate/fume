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

Fume.util.illegalState = function(msg) {
    msg = msg || "This code shouldn't be triggered";
    throw new Error("IllegalStateException: " + msg);
};
/*
Fume.util.expect = function(values, timeout) {
    if (!_.isArray(values))
        return Fume.util.expect([values], timeout);

    timeout = timeout || 1000;
    var done = 0;

    var timeoutHandle = setTimeout(function() {
        if (done < values.length - 1) {
            throw new Error("Test failed: Callback " + done + " for value: " + values[done] + " was never called");
        }
    }, timeout);

    return Rx.Observer.create(function(value) {
        console.log(">> " + value);
        if (done < values.length && values[done] != value)
            throw new Error("Test failed, expected '" + values[done] + "', found: '" + value + "'");
        done += 1;
        if (done == value.length)
            clearTimeout(timeoutHandle);
        else if (done > values.length)
            throw new Error("Test failed: callback was called to often. Latest value: " + value);
    }, console.error, console.log);
};
*/


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
        return this.type == "STOP";
    },
    isDirty : function() {
        return this.type == "DIRTY";
    },
    isReady : function() {
        return this.type == "READY";
    },
    isValue : function() {
        return this.type == "VALUE";
    }
});
Event.Stop = function() {
    return new Event("STOP");
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

        @param {Observer} observable.
        @returns {Disposable} disposable object. Call the @see Fume.Disposable#dispose function to stop listening to this observer
    */
    subscribe : function(observer) {
        if (this.isStopped)
            Fume.util.illegalState(this + ": cannot perform 'subscribe'; already stopped.");

        this.observersIdx += 1;
        this.observers[this.observersIdx] = observer;

        this.replay(observer);

        var observing = this;
        return {
            observerId : this.observersIdx,
            isDisposed : false,
            dispose : function(){
                if (this.isDisposed)
                    Fume.util.illegalState();
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
            Fume.util.illegalState(this + ": cannot perform 'next'; already stopped");
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
        $super(autoClose);

        observable = Observable.fromValue(observable);
        this.dirtyCount = 0;
        this.isFiring = false;
        this.observing = observable;
        this.subscription = observable.subscribe(this);
    },

    onNext : function(event) {
        if (this.isFiring)
            Fume.util.IllegalStateException(this + " cannot perform onNext: event cycle detected");
        this.isFiring =true;

        if (event.isStop())
            this.stop();
        else if (event.isDirty()) {
            if (!this.dirtyCount)
                this.next(event); //push dirty
            this.dirtyCount += 1;
        }
        else if (event.isReady()) {
            this.dirtyCount -= 1;
            if (!this.dirtyCount)
                this.next(event); //push ready
        }
        else {
            this.next(event);
        }
        this.isFiring = false;
    },

    stop : function($super) {
        $super();
        if (this.subscription) {
            this.subscription.dispose();
            this.subscription = null;
        }
    },

    replay : function(observer) {
        this.observing.replay(observer);
    },

    listenTo : function(observable) {
        if (this.isStopped)
            Fume.util.illegalState(this + ": cannot perform 'listenTo', already stopped");

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

Fume.Transformer = clutility({
    initialize : function($super, func /*args*/) {
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
        */
    }
});

/*
Fume.multiply = clutility(Fume.Transformer, {
    initialize : function($super, left, right) {
        $super(function(x, y) {
            return x * y;
        }, left, right);
    }
});
*/

module.exports = Fume;