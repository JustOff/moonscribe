var registry = require('./../registry.js');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
var storage = require('./../storage.js');
var settings = require('./../settings.js')
var Whitelist = require("./whitelist.js");

var UpdatableResource = require('./updatableresource.js');
var Utils = require('../blocker/util.js').Utils;
var pagemod = require("sdk/page-mod");
var skdSelf = require("sdk/self").data;
var platform = require("./platformResoler.js");

// whatsmyuseragent.com

var selectedUIString = false;
var logger = new (require('./logger.js'))(['uarotator']);

const { Ci, Cu, Cc, Cr } = require('chrome');
let { once } = require("sdk/lang/functional");


let originalUserAgent = Cc["@mozilla.org/network/protocol;1?name=http"].getService(Ci.nsIHttpProtocolHandler).userAgent;

var uaResource = new UpdatableResource({
  resourceName: 'cachedUAList',
  localUrl: 'data/data/useragents.txt',
  updateInterval: settings.INTERVALS.USERAGENT_UPDATE,
  remoteUrl: settings.SRVC.USERAGENTS
});

// problem of multiple attach per one window (frames):
// http://stackoverflow.com/q/22382201/449553

var _workers = [];

var userAgentScript = skdSelf.url("uacontentscript.js");
var userAgentConfig = {
  include: ["file://*", "data:*", 'http://*', 'https://*', 'mailbox://*', 'imap://*', 'news://*', 'snews://*'],

  attachTo: ["existing", "top", "frame"],

  onAttach: function(worker) {
    logger.log('on script attach executes');
    _workers.push(worker);
    worker.on("detach", function() {
      var ind = _workers.indexOf(worker);
      if(ind !== -1) {
        _workers.splice(ind, 1);
      }
    });

    worker.on("error", function(e) {
      console.log('ERROR IN SCRIPT:'+e.message+'\n'+e.stack);
    });

    if(!Whitelist.isWhitelisted(worker.tab.url)){
      worker.port.emit('peekUserAgent', selectedUIString);
    }

    worker.port.on("log", function (message) {
      console.log('message from page script:'+message);
    });
  },

  contentScriptFile : [
    userAgentScript
  ],

  contentScriptWhen : 'start'
};

pagemod.PageMod(userAgentConfig);


function setJsUserAgent(userAgent){
  _workers.forEach(function (wrkr) {
    if(!wrkr.tab){
      return;
    }
    if(!Whitelist.isWhitelisted(wrkr.tab.url)){
      wrkr.port.emit('peekUserAgent', userAgent);
    } else {
      wrkr.port.emit('peekUserAgent', originalUserAgent);
    }
  });
}

/**
 * This function should not have side-effects
 */
var peekRandomUA = function() {
  try{
    logger.log('peekRandomUA starts here');
    var list = uaResource.getLastData();
    logger.log('peekRandomUA ends here');
    var userAgentsList = list.split('\n');
    logger.log('userAgentsList size: '+userAgentsList.length);

    // filter by platform
    userAgentsList = userAgentsList.filter(function (el) {
      return el.indexOf(platform) >= 0;
    });

    // and by browser (we are firefox)
    userAgentsList = userAgentsList.filter(function (el) {
      return el.toLowerCase().indexOf('firefox') > -1;
    });

    logger.log('userAgentsList filtered size: '+userAgentsList.length);
    var randomLineIndex = Math.floor( Math.random() * userAgentsList.length );
    var newUserAgent = userAgentsList[randomLineIndex];
    return newUserAgent;
  } catch (e){
    logger.error('peek random UA ERROR', e);
  }
};


var switchUARotator = function(state){
  state = !!state;
  if(state){
    selectedUIString = peekRandomUA();
    setJsUserAgent(selectedUIString);
    logger.log('getting new random UA:'+selectedUIString);
  }
  logger.log('switchUARotator: '+ state);
  registry.register('isUserAgentRotatorOn', state);
  storage.setJSON('userAgentRotatorState', state);
  var panel = registry.resolve('panel');
  panel.port.emit('switchUARotator', state);
};


var init = function(){
    registry.onEvent('loadPrivacyOptions', function(){
      logger.log('loadPrivacyOptions init');
      setTimeout(function () { // async call
        try{
          var /* boolean */ userAgentRotatorState;
          if(storage.has('userAgentRotatorState')){
            userAgentRotatorState = storage.getJSON('userAgentRotatorState');
          } else {
            userAgentRotatorState = false;
          }


          if(userAgentRotatorState){
            uaResource.loadFile().then(function () {
              registry.register('isUserAgentRotatorOn', true);
              switchUARotator(true);
            });
          } else {
            uaResource.loadFile();
            var panel = registry.resolve('panel');
            panel.port.emit('switchUARotator', false);
          }
        } catch (e){
           logger.error('error in UA rotator init', e) ;
        }
      }, 0);
    });

    var panel = registry.resolve('panel');
    panel.port.on('switchUARotatorByUser', function(val){
      switchUARotator(val);
    });

    panel.port.on('switchUAManually', function(){
      selectedUIString = peekRandomUA();
      setJsUserAgent(selectedUIString);
    });

    registry.onEvent(['logout', 'shutdown'], function () {
      uaResource.shutdown();
    });


    registry.onEvent('siteAddToWhitelist', function () {
      setJsUserAgent(selectedUIString);
    });

    registry.onEvent('siteRemoveFromWhitelist', function () {
      setJsUserAgent(selectedUIString);
    });

};

var getUA = function() {
  if(uaResource.getLastData() === false){
    // small chance on first start in case if this will be called before ANY reader will end (note: first reader is from local file system, so it must ends quite fast, but still it is asynchronous so this situation is possible)
    return originalUserAgent;  // return default
  }
  uaResource.maybeUpdateResource();
  if(selectedUIString === false){
    selectedUIString = peekRandomUA();
    setJsUserAgent(selectedUIString);
  }
  return ''+selectedUIString;
};

  // call only from network listener
var isUARotatorOn = function (url) {
    if(!url){
      return false;
    }

    try{
      if(registry.has('isUserAgentRotatorOn')){
        var rotatorIsOn = !!registry.resolve('isUserAgentRotatorOn');
        if(rotatorIsOn){
          if(Whitelist.isWhitelisted(url)){
            return false;
          }
        }
        return rotatorIsOn;
      } else {
        return false;
      }
    } catch (e) {
      logger.error('problem getting rotator state for url:'+url, e);
    }

};

exports.init = init;
exports.getUA = getUA;
exports.isUARotatorOn = isUARotatorOn;