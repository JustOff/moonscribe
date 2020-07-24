// var storage = require("sdk/simple-storage").storage; // <-- not working
// this is actually reason why this file exists
// p.s.: jpm run -p <profile_name> not solve the problem
// work around via preferences


var preferences = require("sdk/preferences/service");

var myself = require('sdk/self');
var addPrefix = function(key){
	return ['extensions', myself.id, key].join('.');
};


var storage = {
	
	get: function(key){
		return preferences.get(addPrefix(key));
	},
	
	set: function(key, val){
		preferences.set(addPrefix(key), val);
	},
	
	has: function(key){
		return preferences.isSet(addPrefix(key));
	},
	
	reset: function(key){
		preferences.reset(addPrefix(key));
	},
  
  getJSON: function(key){
		try{
			return JSON.parse(preferences.get(addPrefix(key)));
		} catch(e){
			console.log('problem getting key:'+key+'('+addPrefix(key)+')'+ ' from value:'+preferences.get(addPrefix(key)));
			throw e;
		}
  },
  
  setJSON: function(key, obj){
		preferences.reset(addPrefix(key));
    preferences.set(addPrefix(key), JSON.stringify(obj));
  }
};

module.exports = storage;