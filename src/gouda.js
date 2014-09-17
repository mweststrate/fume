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

Gouda.AbstractTransformer = Gouda.util.declare(/*Gouda.Variable,*/ {
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
/*
Gouda.util.declare = function(superclazz , properties) {
    if (!properties){
        properties = superclazz;
        superclazz = null;
    }

    //constructor
    var constructor = function() {
        return this; //avoid warning
    };

    var proto = constructor.prototype = {}; //start with empty prototype

    //set toString on beforehand, so it can be overridden.
    proto.toString = function() {
        return "[object " + this.constructor.classname + "#" + this.noaid + "]";
    };

    //Copy properties from mixins
    for(var j = 0; j < mixins.length; j++) {
        for(var propname in mixins[j]) {
          (function() { //Function to capture thing in scope

              var thing = mixins[j][propname];
              if (jQuery.isFunction(thing) && jQuery.isFunction(proto[propname])) {
                        if (propname == "init") {
                            //already exists, lets monkey patch...
                            var base = proto[propname];
                            proto[propname] = function() {
                                    base.apply(this, arguments);
                                    thing.apply(this, arguments);
                                //func.superValue = base.apply(this, arguments); //TODO: document that superValue is available as arguments.callee.superValue ....
                                //return thing.apply(this, arguments);
                            }
                        }
                        else if (propname == "free") {
                            //already exists, lets monkey patch...
                            var base = proto[propname];
                            proto[propname] = function() {
                                    thing.apply(this, arguments); //NOTE: reverse order of init
                                    base.apply(this, arguments);
                                //func.superValue = base.apply(this, arguments); //TODO: document that superValue is available as arguments.callee.superValue ....
                                //return thing.apply(this, arguments);
                            }
                        }
                        else { //replace, but keep super pointer
                            thing.overrides = proto[propname];
                            proto[propname] = thing;
                        }
              }
              else //one of them is not a function, just override
                  proto[propname] = thing;

          })();
        }
    }

    //Finish; add some 'built ins' to the class
    constructor.classname = name; //store the classname
    proto.constructor = constructor; //store the constructor type to find the type back

    constructor.isA = function(thing) {
      return !!(thing && thing.interfaces && jQuery.inArray(this.classname, thing.interfaces()) > -1);
    }

    constructor.count = 0;

    //Some general functions
    proto.inherited = function() {
        var f = args.callee;
        var g = f.overrides;
        if (!g)
          throw "inherited(): No super method available!";
            //return undefined;
        return g.apply(this, arguments);
    };

    proto.interfaces = function() {
      return implementsAr;
    };
};
*/