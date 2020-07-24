const { Ci, Cu, Cc, Cr, components, Cm} = require('chrome');

var storage = require('./../storage.js');
var registry = require('./../registry.js');
var settings = require('./../settings.js');
var self = require("sdk/self");

var logger = new (require('./logger.js'))(['main']);


var isRestartRequired = function (loadReason) {
  if(loadReason == 'downgrade' || loadReason == 'upgrade'){
    return true;
  }
  return false;
};

var showRestartDialogPrompt = function () {
  registry.register('restart_required', true);
  /// emitEvent('switch_section', 'restart_required');
};

var doVersionCheck = function (loadReason) {
  // extension version check
  logger.error('init with self.version:'+self.version+'('+typeof self.version+'), reason:'+loadReason);

  if(storage.get('version') != self.version) {
    if(settings.purge_storage_for_older_versions) {
      registry.resolve('purgeStorageOnLogOut')();
    }
    storage.set('version', self.version);
  }

  if(isRestartRequired(loadReason)){
    console.log('restart required for any reason');
    showRestartDialogPrompt();
  }

  if(storage.has('whitelist')){
    var list = storage.getJSON('whitelist');
    if(list.length>1){
      var itemToTest = list[0];
      // is a string
      if(itemToTest.length && !itemToTest.url){
        var newList = list.map(function (el) {
          return {url: el};
        });
        storage.setJSON('whitelist', newList);
      }
    }
  }

};

exports.doVersionCheck = doVersionCheck;
