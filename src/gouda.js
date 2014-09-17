var _ = require("underscore");
var Rx  = require("rx");

//
// Set up namespaces
//

var Gouda = Gouda || {};
if (!Gouda.util)
    Gouda.util = {};

//
// Utilties
//

Gouda.util.illegalState = function() { throw new Error("IllegalStateException: This code shouldn't be triggered"); };

Gouda.util.extractFunctionArgumentNames = function(fn) {
    //http://stackoverflow.com/a/14660057
    return fn.toString()
    .replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s))/mg,'')
    .match(/^function\s*[^\(]*\(\s*([^\)]*)\)/m)[1]
    .split(/,/);
};

/**
    Creates a new constructor (class).
    First (optional) argument defines the superclass for the new class.
    The second argument defines all the properties and methods of the new class.
    The constructor should be called 'initialize'.

    Superclass methods can be invoked by naming the first parameter of a function `$super`.
    The (bound) super implementation well then be injected to the function and can be called.

    Declare has three important base properties
    - it is easy to invoke super methods
    - works well with superclasses that are not defined by the same system
    - super constructors can be used, but are not called automatically
    - stand alone and small: TODO: make own package for declare
*/
Gouda.util.declare = function(superclazz, props){
    if (!superclazz)
        throw new Error("Super class not defined");
    var slice = Array.prototype.slice;

    /*
        make arguments uniform
    */
    props = arguments.length == 1 ? superclazz : props;
    superclazz = arguments.length > 1 ? superclazz : Object;

    /*
        find the class initializer and inject '$super' if necessary
    */
    var clazzConstructor = props.initialize || _.noop;
    if (Gouda.util.extractFunctionArgumentNames(clazzConstructor)[0] === "$super") {
        var baseClazzConstructor = clazzConstructor;
        clazzConstructor = function() {
            baseClazzConstructor.apply(this, [_.bind(superclazz, this)].concat(slice.call(arguments)));
        };
    }

    /*
        setup the prototype chain
    */
    var proto = clazzConstructor.prototype = new superclazz();

    /*
        remove any internal state from the prototype so that it is not accidentally shared.
        If a subclass is dependent on internal state, it should call the super constractor in
        it's initialize section
    */
    for(var key in proto) if (proto.hasOwnProperty(key))
        delete proto[key];

    proto.constructor = clazzConstructor; //weird flaw in JS, if you set up a prototype, restore constructor ref afterwards
    var superproto = superclazz.prototype;

    /*
        fill the prototype
    */
    _.each(props, function(member, key) {
        if (key  === 'initialize' || !props.hasOwnProperty(key))
            return;
        else if (_.isFunction(member) && Gouda.util.extractFunctionArgumentNames(member)[0] === "$super") {
            var supermethod = superproto[key];
            if (!supermethod || !_.isFunction(supermethod))
                throw new Error("No super method found for '" + key + "'");

            proto[key] = function() {
                return member.apply(this, [_.bind(supermethod, this)].concat(slice.call(arguments)));
            };
        }
        else {
            proto[key] = member;
        }
    });

    return clazzConstructor;
};

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
Gouda.BaseSubject = Gouda.util.declare(Rx.Subject, {

    disposables : null,
    exception : null,

    initialize : function($super) {
        debugger;
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
    A Variable is a mutable subject that can be listed to for changes. When subscribing, the
    lastest value will be pushed immediately to the subscriber
*/
Gouda.Variable = Gouda.util.declare(Gouda.BaseSubject, {
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

Gouda.AbstractTransformer = Gouda.util.declare(Gouda.Variable, {
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