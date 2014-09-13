var _ = require("underscore");
var Bacon  = require("baconjs");

// 
// Set up namespaces
// 

var Gouda = Gouda || {};
if (!Gouda.util)
    Gouda.util = {};

// 
// Utilties
//

Gouda.util.declare = function(superclazz, props){
    props = arguments.length == 1 ? superclazz : props;
    superclazz = arguments.length > 1 ? superclazz : Object;

    //create the constructor function
    var constructor  = function() {
        if (props.init)
            props.init.apply(this, arguments);
    };

    //build the prototype
    constructor.prototype = new superclazz();

    //and fill it
    for (var key in props)
        constructor.prototype[key] = props[key];

    return constructor;
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

    return function(value) {
        console.log(">> " + value);
        if (done < values.length && values[done] != value)
            throw new Error("Test failed, expected '" + values[done] + "', found: '" + value + "'");
        done += 1;
        if (done == value.length)
            clearTimeout(timeoutHandle);
        else if (done > values.length)
            throw new Error("Test failed: callback was called to often. Latest value: " + value);
    };
};

Gouda.makeFunctionArgsObservable = function(func) {
    return function() {
        func.apply(this, _.map(arguments, Gouda.toObservable));
    };
};

Gouda.toObservable = function(thing) {
    
};

Gouda.Variable = Gouda.util.declare({
    
    init : function(initialValue) {
        this.currentValue = initialValue;
        var self = this;
        this.stream = new Bacon.EventStream(function(sink) {
            //sink(new Bacon.Next(function() { return initialValue;}));
            self.sink = sink;
        }).scan(true, _.noop).map(function() {return self.currentValue;});
    },

    set : function(value) {
        this.currentValue = value;
        if (this.sink)
            this.sink(new Bacon.Next());
    },

    get : function() {
        return this.currentValue;
    }
});


Gouda.multiple = Gouda.makeFunctionArgsObservable(function(a, b) {
    return a.combine(b, function(x, y) { return x * y;});
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