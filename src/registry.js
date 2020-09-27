var logger = new (require('./misc/logger.js'))(['main']);

// commonJS loader is fine but we need circular dependencies
// just a runtime storage
var registry = {

};


registry.store = {};

registry.register = function(name, object){
  registry.store[name] = object;
};

registry.resolve = function(name){
  if(name in registry.store){
    return registry.store[name];
  }
  throw new Error('There is no such item in registry:'+name);
};


registry.has = function (name) {
  return name in registry.store;
};

registry.reset = function (name) {
  delete registry.store[name];
};

registry.eventsStore = {};

registry.emitEvent = function(eventType/*, ... */){
  var res;
  var params = [].slice.call(arguments);
  params.shift();
  if(eventType in registry.eventsStore){
    let handlers = registry.eventsStore[eventType];
    for(let i = 0; i<handlers.length; i++){
      try{
        res = handlers[i].apply(null,params);
      } catch (e){
        logger.error('eventType['+eventType+'] error: '+e.message+'\n'+e.stack);
      }
    }
  }
  return res;
};

registry.onEvent = function(eventType, handler){
  if(!(eventType instanceof Array)){
    eventType = [eventType];
  }
  for(var i = 0; i< eventType.length; i++){
    let oneEvent = eventType[i];
    if(!(oneEvent in registry.eventsStore)){
      registry.eventsStore[oneEvent] = [];
    }
    registry.eventsStore[oneEvent].push(handler);
  }
};

registry.constants = {
  icon: {
    grey: 'grey',
    blue: 'blue',
    doubleHop: 'doubleHop',
    error: 'error'
  }
};

module.exports = registry;