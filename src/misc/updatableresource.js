
var registry = require('./../registry.js');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
var ss = require("sdk/simple-storage").storage;

var ourStore = require('./../storage.js');

var sstorage = {
  has: function(name){
    return (typeof ss[name] !== 'undefined')
  },
  setJSON: function(name, val){
    ss[name] = val;
  },
  getJSON: function(name){
    if(name in ss){
      return ss[name];
    } else {
      throw new Error('miss data');
    }
  }
};
var settings = require('./../settings.js');
//noinspection JSUnresolvedVariable
var {Request, TryBackupException} = require("./request.js");
var {isNoInternetErrorCode} = require('./../common_helpers.js');
let { debounce } = require("sdk/lang/functional");
var logger = new (require('./logger.js'))(['main', 'blocker', 'uarotator']);
var myself = require("sdk/self");


const { Ci, Cu, Cc, Cr } = require('chrome');

//noinspection JSUnresolvedVariable
const nsIIOService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);


//noinspection FunctionNamingConventionJS,ParameterNamingConventionJS
function get_url_async(_url, /* function(data) */ _callback_success, /* function(status) */ _callback_fail) {
  var channel=nsIIOService.newChannel(_url,null,null);
  //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  channel.asyncOpen(
    {
      buffer:null,
      onStartRequest: function(/*in nsIRequest*/ aRequest, /*in nsISupports*/ aContext)
      {
        this.buffer = "";
      },
      onStopRequest: function(/*in nsIRequest*/ aRequest, /*in nsISupports*/ aContext, /*in nsresult*/ aStatusCode)
      {
        //noinspection JSUnresolvedVariable
        if(aStatusCode === Cr.NS_OK) {
          _callback_success(this.buffer);
        } else {
          //noinspection JSCheckFunctionSignatures
          _callback_fail(aStatusCode);
        }
      },
      onDataAvailable: function(/*in nsIRequest*/ aRequest, /*in nsISupports*/ aContext, /*in nsIInputStream*/ aInputStream, /*in unsigned long*/ aOffset, /*in unsigned long*/ aCount)
      {
        //noinspection LocalVariableNamingConventionJS,JSUnresolvedVariable
        var scriptable_in_stream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
        scriptable_in_stream.init(aInputStream);
        this.buffer += scriptable_in_stream.read(aCount);
        scriptable_in_stream.close();
      }
    },
    /* context */ null
  );
}



var UpdatableResource = function (config) {
    var me = this;
    if(typeof config.remoteUrl == "undefined"){
      throw new Error('missing arument: remoteUrl');
    }
    me.remoteUrl = config.remoteUrl;

    if(typeof config.localUrl == "undefined"){
      throw new Error('missing arument: localUrl');
    }
    me.localUrl = config.localUrl;

    if(typeof config.resourceName == "undefined"){
      throw new Error('missing arument: resourceName');
    }
    me.resourceName = config.resourceName;
    me.lastLoadTime = 'lastLoadTime'+config.resourceName;
    me.reQueryActiveName = 'reQuery'+config.resourceName+'Active';

    // use simple storage, if not saying opposite
    var useSS = ('useSS' in config)?(!!config.useSS):true;
    var storage;
    if(useSS){
      storage = sstorage;
    } else {
      storage = ourStore;
    }


    if(typeof config.updateInterval == "undefined"){
      throw new Error('missing arument: updateInterval');
    }

    me.updateInterval = config.updateInterval;
    let runningRequests = [];



    me.shutdown = function () {
      logger.log('shutdown resource: '+me.resourceName);
      // keep even between logout-login
      // storage.reset(me.resourceName);
      // storage.reset(me.lastLoadTime);
      if(storage.has(me.reQueryActiveName)){
        if(registry.resolve(me.reQueryActiveName) === true){
          // situation:
          //     stopping all in the middle of resource update
          // problem:
          //     ff has no way to cansel requests
          // solution:
          //     only way to handle this is - ignore responce in callback if _this_
          //     request was canceled, so we need to idetify each request some
          //     way and have a way to get this id in responce handler
          //  so:
          for(let req of runningRequests){
            req.cencel();
          }
        }
      }
    };


    me.loadFile = function () {
      return new Promise(function (resolve, reject) {
        if(!storage.has(me.resourceName)){
          // load init from file, will re-query once internet will be accessible
          //noinspection JSUnusedLocalSymbols
          get_url_async('resource://'+myself.name+'/'+me.localUrl, function (content) {
            storage.setJSON(me.resourceName, content);
            logger.log('successfully loaded file('+me.localUrl+') content length:'+content.length);
            resolve();
          }, function (errorCode) {
            // impossible situation
            logger.log('impossible situation happened, check presence of /'+me.localUrl);
          });
        } else {
          // just run callback, list will be updated asynchronously
          resolve();
        }
      }).then(function () {
          me.maybeUpdateResource();
          return Promise.resolve();
      });
    };

    me.maybeUpdateResource = function () {
      if(doNeedReQuery()){
        runningRequests.push(doRemoteQuerying());
      }
    };


    var updateClbcks = [];
    me.onResourceUpdate = function (fn) {
      if(updateClbcks.indexOf(fn)<0){
        updateClbcks.push(fn);
      }
    };

    function runResourceClbcks (){
      for(let clbck of updateClbcks){
        try{
          clbck();
        } catch (e){
          logger.error('error in clbck of resource updatr of: '+me.resourceName);
        }
      }
    }

    me.getLastData = function () {
      try{
        me.maybeUpdateResource();
      } finally{
        try{
          return storage.getJSON(me.resourceName);
        } catch (e){
          return false;
        }
      }
    };


    //noinspection NestedFunctionJS
    function doNeedReQuery() {
      if(storage.has(me.lastLoadTime)){
        var lastLoadTimeOfUAList = storage.getJSON(me.lastLoadTime);
        var now = Date.now();
        var fineCacheDate = now - me.updateInterval;
        var needRequery = lastLoadTimeOfUAList < fineCacheDate;
        if(needRequery){
          if(registry.has(me.reQueryActiveName)){
            if(true === registry.resolve(me.reQueryActiveName)){
//              console.log(me.resourceName+', lastLoadTime outdated, but reQueryActive === true, so query is running, do not need more');
              return false;
            }
          }
          logger.log(me.resourceName+', resource outdated, so will start update');
          return true;
        } else {
          return false;
        }
      } else {
        if(registry.has(me.reQueryActiveName)){
          if(registry.resolve(me.reQueryActiveName) === true){
//             console.log(me.resourceName+', none lastLoadTime, so must be first run, but not updating because already started');
            return false;
          }
        }
        logger.log(me.resourceName+', none time was saved and none update process started, so need to start it');
        return true;
      }
    }


    function genRequest(){
      var res = {};
      res.cancelled = false;
      res.cencel = function () {
        res.cancelled = true;
      };
      return res;
    }

    function removeRequest(req){
      var index = runningRequests.indexOf(req);
      if (index > -1) {
        runningRequests.splice(index, 1);
      }
    }




    //noinspection NestedFunctionJS
    function doRemoteQuerying () {
      logger.log('reQuery '+me.resourceName+' start');
      registry.register(me.reQueryActiveName, true);
      let req = genRequest();
      //noinspection JSUnusedGlobalSymbols
      Request({
        url: me.remoteUrl,
        onComplete: function (response) {
          if (isNoInternetErrorCode(response)) {
            if(!response.isBackup){
              throw new TryBackupException();
            }
            // nothing to do here anyway
            return;
          }

          removeRequest(req);
          if(req.cancelled){
            // 'let' solve closure problem
            registry.register(me.reQueryActiveName, false);
            return;
          }

          if(response.status != 200){
            // postpone for another second
            setTimeout(function () {
              registry.register(me.reQueryActiveName, false);
            }, 1000);
            logger.log('updating '+me.resourceName+" ended with problem, will run next time");
          } else {
            storage.setJSON(me.resourceName, response.text);
            storage.setJSON(me.lastLoadTime, Date.now());        // avoid
            registry.register(me.reQueryActiveName, false);      // race condition
            logger.log('updating '+me.resourceName+" ended fine");
            runResourceClbcks(response.text);
          }
        }
      }).get();
      return req;
    }



};



//noinspection JSUnresolvedVariable
module.exports = UpdatableResource;




