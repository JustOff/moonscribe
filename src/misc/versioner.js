const { Ci, Cu, Cc, Cr, components, Cm} = require('chrome');

var storage = require('./../storage.js');
var registry = require('./../registry.js');
var settings = require('./../settings.js');
var self = require("sdk/self");

var logger = new (require('./logger.js'))(['main']);

// const { components, CC, Cc, Ci, Cr, Cu } = require("chrome");
// var versionComparator = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
// https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIVersionComparator

var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo); // no access to minor numbers, useless
var xulRuntime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime);


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

  // browser version check
  // console.log(appInfo.platformVersion);
  // no way to check minor version, like '47.0b1', we have only '47' so far,
  // checking chanel, in combination it will cover our case
  // might be at some moment this will prevent some beta users from using the proxy, when problem will be resolved, but no other way
  // xulRuntime.defaultUpdateChannel == 'beta', see full list there: http://kb.mozillazine.org/App.update.channel
  if(appInfo.platformVersion === '47.0' && xulRuntime.defaultUpdateChannel == 'beta'){
    // hope it will be fixed in release
    registry.register('disable_PAC_due_to_1267000_bug', true); // later time can be renamed
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
