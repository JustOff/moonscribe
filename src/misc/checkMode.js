var registry = require('./../registry.js');
var storage = require('./../storage.js');

var { isProxyOn  } = require('./networkListener.js');
var { getCurrentLocation } = require('../common_helpers.js');

module.exports = {
  init: function(){
    registry.onEvent('checkMode', function(){
      var myLocation = getCurrentLocation();
      if(myLocation === false){
        return; // no case for that
      }

      if ( storage.get('externalApp') ) {
        if ( storage.get('doubleHopSetByUser') ) {
          storage.set('extensionMode', 'doubleHop');
        } else {
          storage.set('extensionMode', 'externalApp');
          registry.emitEvent('setOurLocation');
        }
      } else {
        if('Automatic' == myLocation.name){
          storage.set('extensionMode', 'cruiseControl');
        } else {
          storage.set('extensionMode', 'manual');
        }
      }
      console.log('extensionMode', storage.get('extensionMode'), storage.get('externalApp') )
      
      // registry.register('isDoubleHop', 'our_location' in data);
      registry.emitEvent('updateCurrentModeLabels');
    });
  }
};