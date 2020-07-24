var storage = require('./../storage.js');
var { getEndpoint, getWithBasicSigning, isNoInternetErrorCode} = require('./../common_helpers.js');
var {Request, TryBackupException} = require("./request.js");
var registry = require('./../registry.js');
var tabs = require('sdk/tabs');
var settings = require('./../settings.js');


var reportInstall = function () {
  Request({
    url: getEndpoint("RecordInstall/ext"),
    content: getWithBasicSigning({ }),
    onComplete: function (response) {
      if (isNoInternetErrorCode(response)) {
        if(!response.isBackup){
          throw new TryBackupException();
        }
      }
    }
  }).post();
};

var openSiteTab = function (/* alphanumeric */ isSignUp) {
  return function (userId) {
    var panel = registry.resolve('panel');
    if(isSignUp){
      panel.hide();
      tabs.open(settings.LNK.LNK_FRSTRUN.replace(/\{user_id\}/, userId));
    } else {
      if(storage.has('knownUsers')){
        var knownUsers = storage.getJSON('knownUsers');
        if(knownUsers.indexOf(userId) == -1){
          knownUsers.push(userId);
          storage.setJSON('knownUsers', knownUsers);
          panel.hide();
          tabs.open(settings.LNK.LNK_FRSTRUN.replace(/\{user_id\}/, userId));
        }
      } else {
        storage.setJSON('knownUsers', [userId]);
        panel.hide();
        tabs.open(settings.LNK.LNK_FRSTRUN.replace(/\{user_id\}/, userId));
      }
    }
  }
};

module.exports = {
  init: function(){
    if(!storage.has('reportInstall')){
      reportInstall();
      storage.set('reportInstall', '1');
    }

    //noinspection JSCheckFunctionSignatures
    registry.onEvent('signUpSuccess', openSiteTab(true));
    //noinspection JSCheckFunctionSignatures
    registry.onEvent('postLoginSuccess', openSiteTab(false));


    if(!storage.has('whitelist')) {
      storage.setJSON('whitelist', settings.whitelistDefault);
    }

    
  }
};