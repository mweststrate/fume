var _ = require("lodash");
var Rx  = require("rx");
var clutility = require("clutility");

//
// Set up namespaces
//

var Gouda = Gouda || {};

//
// Utilties
//
Gouda.util = {};

Gouda.util.illegalState = function(msg) {
    msg = msg || "This code shouldn't be triggered";
    throw new Error("IllegalStateException: " + msg);
};
/*
Gouda.util.expect = function(values, timeout) {
    if (!_.isArray(values))
        return Gouda.util.expect([values], timeout);

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

var Event = Gouda.Event = clutility({
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
    Observable is a stream that might push values to all its subscribers until the Gouda.Event.Stop is propagated.

*/
var Observable = Gouda.Observable = clutility({

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
        @returns {Disposable} disposable object. Call the @see Gouda.Disposable#dispose function to stop listening to this observer
    */
    subscribe : function(observable) {
        if (this.isStopped)
            Gouda.util.illegalState(this + ": cannot perform 'subscribe'; already stopped.");

        this.observersIdx += 1;
        this.observers[this.observersIdx] = observable;

        var currentState = this.getState();
        if (currentState) for(var i = 0, l = currentState.length; i < l; i++)
            observable.next(currentState[i]);

        var observing = this;
        return {
            observerId : this.observersIdx,
            isDisposed : false,
            dispose : function(){
                if (this.isDisposed)
                    Gouda.util.illegalState();
                this.isDisposed = true;
                observing.unsubcribe(this);
            }
        };
    },

    /*
        @private
    */
    unsubcribe : function(disposable) {
         delete observing.observers[this.observerId];
         if (this.autoClose && !this.hasObservers())
            this.stop();
    },

    /*
        Returns whether any observers are listening to this observable
    */
    hasObservers : function() {
        for(var key in this.observers)
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
            Gouda.util.illegalState(this + ": cannot perform 'next'; already stopped");
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

var Disposable = Gouda.Disposable = clutility({
    dispose : function() {
        //stub
    }
});

var Observer = Gouda.Observer = clutility({
    onNext : function(value) {
        //Just a stub
    }
});

var Pipe = Gouda.Pipe = clutility(Observable, {

    initialize : function($super, observable, autoClose){
        $super(autoClose);
        this.dirtyCount = 0;
        this.isFiring = false;
        this.observing = observable;
        this.subscription = observable.subscribe(this);
    },

    onNext : function(event) {
        if (this.isFiring)
            Gouda.util.IllegalStateException(this + " cannot perform onNext: event cycle detected");
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
            Gouda.util.illegalState(this + ": cannot perform 'listenTo', already stopped");

        if (observable != this.observing && !Constant.equals(observable, this.observing)) {
            this.subscription.dispose();
            this.subscription = observable.subscribe();
            this.observing = observable;
            observable.replay(this);
        }
    }
});

var Constant = Gouda.Constant = clutility(Gouda.Observable, {
    initialize : function($super, value) {
        $super(false);
        this.value = value;
    },
    replay : function(observer) {
        observer.onNext(Gouda.Event.Dirty);
        observer.onNext(new Gouda.Event.Value(this.value));
        observer.onNext(Gouda.Event.Ready);
    }
});

Constant.equals = function(left, right) {
    return left instanceof Constant && right instanceof Constant && left.value === right.value;
};

Gouda.Buffer = clutility({
    initialize : function() {
        this.reset();
    },
    onNext : function(x) {
        this.buffer.push(x);
    },
    reset : function() {
        this.buffer = [];
    }
});

Gouda.makeFunctionArgsObservable = function(func) {
    return function() {
        return func.apply(this, _.map(arguments, Gouda.toObservable));
    };
};

Gouda.toObservable = function(thing) {
    if (thing instanceof Rx.Observable)
        return thing;
    return new Gouda.Variable(thing); //Todo or Observable.just?
};

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
  Gouda base subject is very similar to Rx.Subject, with the difference that it automatically disposes
  after the last listener has left. It will then also stop observing any observables it is listening to.
  (if the disposable is stored by using this.registerDisposable)
*/
Gouda.BaseSubject = clutility(Rx.Subject, {

    disposables : null,
    exception : null,

    initialize : function($super) {
        $super();
        this.disposables = [];
    },

    subscribe : function(subscriber) {
        if (this.isDisposed)
            throw new Error("Already disposed");

        if (this.exception) {
            subscriber.onError(this.exception);
            return Rx.Disposable.empty;
        }
        else if (this.isStopped) {
            subscriber.onCompleted();
            return Rx.Disposable.empty;
        }
        else {
            var self = this;
            this.observers.push(subscriber);
            return {
                dispose : function() {
                    self.unsubcribe(subscriber);
                }
            };
        }
    },

    unsubcribe : function(subscriber) {
        if (this.observers) {
            var idx = this.observers.indexOf(subscriber);
            if (idx !== -1) {
                this.observers.splice(idx, 1);

                //nobody listening anyore?
                if (this.observers.length === 0)
                    this.dispose();
            }
        }
    },

    registerDisposable : function(disposable) {
        this.disposables.push(disposable);
    },

    dispose : function($super) {
        if (!this.isDisposed) {
            $super();
            _.each(this.disposables, function(disposable) {
                disposable.dispose();
            });
            this.disposables = null;
        }
    }
});

/**
    A subject that, whenever a new observer is registered, sends a sequence of events to this observer in
    order to get the state of this observer up to data as quickly as possible
*/
Gouda.ReplayableStream = null;

/**
    An observable that, between the dirty and stable state, queues and optimizes all incoming events, by
    stripping out all events that are shadowed by a later event.

    Fires all queued events just before becoming stable.
*/
Gouda.OptimizingStream = null;

/**
    An observable that accepts multiple incoming streams, and zips them into a single stream that only fires when
    either all input streams are stable or one stream has an error and is stable
*/
Gouda.SyncingStream = null;

Gouda.Transformer = clutility({
    initialize : function($super, func /*args*/) {
        $super();
        /* Pseudo:
        inputargs = arguments.slice(2);
        optimizedArgs = _.map(inputargs, function(arg) {
            return new Gouda.OptimizingStream(arg);
        });
        syncedArgs = new Gouda.SyncingStream(optimizedArgs);

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
Gouda.multiply = clutility(Gouda.Transformer, {
    initialize : function($super, left, right) {
        $super(function(x, y) {
            return x * y;
        }, left, right);
    }
});
*/


/**
    A Variable is a mutable subject that can be listed to for changes. When subscribing, the
    lastest value will be pushed immediately to the subscriber
*/
Gouda.Variable = clutility(Gouda.BaseSubject, {
    value : undefined,

    initialize : function($super, initialValue) {
        $super();
        this.value = initialValue;
    },

    subscribe : function($super, subscriber) {
        console.log(subscriber);
        if (!this.isStopped && !this.exception)
            subscriber.onNext(this.value);
        return $super(subscriber);
    },

    set : function(value) {
        this.value = value;
        this.onNext(value);
    },

    get : function() {
        return this.value;
    },
});

Gouda.AbstractTransformer = clutility(Gouda.Variable, {
    inputs : null,
    initialize : function() {
        inputs = _.map(Gouda.toObservable); //Todo: wrap in syncing queue
    },
    onExecute : function() {
        throw new Error("onExecute of transformer is not implemented");
    }
});

Gouda.multiply = Gouda.makeFunctionArgsObservable(function(a, b) {
    return a.combineLatest(b, function(x, y) { return x * y;});
});

module.exports = Gouda;