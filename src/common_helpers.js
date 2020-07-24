var tabs = require('sdk/tabs');
var md5 = require('./md5.js').md5;
var base64 = require("sdk/base64");
var preferences = require("sdk/preferences/service");
var {Request, TryBackupException} = require("./misc/request.js");

var storage = require('./storage.js');
var settings = require('./settings.js');

var registry = require("./registry.js");

let { debounce } = require("sdk/lang/functional");
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
var logger = new (require('./misc/logger.js'))(['main']);
var self = require("sdk/self");


var {viewFor} = require('sdk/view/core');
var {modelFor} = require('sdk/model/core');
var {getBrowserForTab, getTabForContentWindow, getTabForId} = require("sdk/tabs/utils");
var {Ci, Cu} = require("chrome");
Cu.import("resource://gre/modules/XPCOMUtils.jsm", this);

let Utils = require('./blocker/util.js').Utils;

var panels = require("sdk/panel");

const { PrefsTarget } = require("sdk/preferences/event-target");
const { getWithBasicSigning, getWithSessionedSigning, getEndpoint, isNoInternetErrorCode,
    validResponceWithCredentials, changeLocation } = require('./misc/utils');
const { sessionUpdateFunction } = require('./misc/sessionupdate');

  try{

    var errorPanel = panels.Panel({
      width: 300,
      height: 200,
      contentURL: self.data.url("popup.html"),
      contentScript: [
        'window.addEventListener("load", function(){',
        '    self.port.on("show_error", function(message){',
        '        document.getElementById("message").innerHTML = message;',
        '    });',
        '});'
      ].join('\n')
    });

    var reportMessage = function(message){
      errorPanel.on("show", function() {
        errorPanel.port.emit('show_error', message);
      });
      errorPanel.show();
    };

  } catch (e){
    logger.error('ERROR:'+e);
  }

  try{

      var urlChangeListener = function(clbck){
        // good till called once

        var progressListener = {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener, Ci.nsISupportsWeakReference]),
            onLocationChange: function(aProgress, aRequest, aURI) {
                var thisTab = getTabForId(tabs.activeTab.id);
                var thierTab = getTabForContentWindow(aProgress.DOMWindow);
                if(thisTab == thierTab){
                  var highLevel= modelFor(thierTab);
                  clbck(highLevel.url);
                }
            }
        };


        var thisLowLevelTab = viewFor(tabs.activeTab);
        var thisBrowser = getBrowserForTab(thisLowLevelTab);
        thisBrowser.addProgressListener(progressListener);


        tabs.on('open', function(newTab) {
            var lowLevel = viewFor(newTab);
            var browser = getBrowserForTab(lowLevel);
            browser.addProgressListener(progressListener);
        });

        var updateURL = function (tab) {
         clbck(tab.url);
        };

        tabs.on("activate", updateURL);
        tabs.on("pageshow", updateURL);
      }
  } catch (e){
    logger.error('ERROR:'+e);
  }



/** */
/** common*/
if (!String.prototype.startsWith) {
  Object.defineProperty(String.prototype, 'startsWith', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function(searchString, position) {
      position = position || 0;
      return this.lastIndexOf(searchString, position) === position;
    }
  });
}
/** */

try{
  var isProxied = function () {
    var currentProxy = preferences.get('network.proxy.autoconfig_url');
    var pType = preferences.get('network.proxy.type');
    if (currentProxy && ('' + currentProxy).indexOf('windscribe') > -1 && pType===2) {
      return true;
    }
    return false;
  };
} catch (e){
  logger.error('ERROR:'+e);
}


try{
  var getCurrentUrl = function(){
    var res = tabs.activeTab.url;
    return res;
  }
} catch(e){
  logger.error('ERROR:'+e);
}

try{

    var isExtraSecond = function () {
      return !!(registry.has('extraSecondOnTurnOff') && registry.resolve('extraSecondOnTurnOff') === true);
    };

    var turnOffProxy = function(panel, preserve){
        registry.register('proxy_state_remember', "Off");

        var originalProxyState = parseInt(storage.get('proxy_state_original'), 10)
        isNaN(originalProxyState) ? preferences.reset('network.proxy.type') : preferences.set('network.proxy.type', originalProxyState);
        storage.reset('proxy_state_original');

        var proxyUrlOriginal = storage.get('proxy_autoconfig_url_original')
        proxyUrlOriginal ? preferences.set('network.proxy.autoconfig_url', proxyUrlOriginal) : preferences.reset('network.proxy.autoconfig_url')

        storage.reset('proxy_autoconfig_url_original');
        storage.reset('WS_GRP');

        panel.port.emit('proxy_status', false);
        if(preserve){
          storage.set('proxy_state_must', "Off");
        }
        registry.resolve('makeOnline')(registry.constants.icon.grey);
        registry.emitEvent('updateCurrentModeLabels');
        registry.register('extraSecondOnTurnOff', true);
        setTimeout(function () {
          registry.register('extraSecondOnTurnOff', false);
        }, 5000);
    };

    var startWatcher = function(){
      var debounceCaller = debounce(function(prefName, pType, pac){
        registry.resolve('proxy_became_broken')(prefName, pType, pac);
      }, 2500);
      // based on: sdk/simple-prefs#on, BUT NOT a part of public api

      let glPref = PrefsTarget({});
      var listener = function(prefName) {
        if(prefName == 'network.proxy.type' || prefName == 'network.proxy.autoconfig_url'){
          // is our proxy
          // our settings actually exists
          let pac = ''+preferences.get('network.proxy.autoconfig_url');
          let pType = preferences.get('network.proxy.type');

          let rememberedState = registry.resolve('proxy_state_remember');


          if(pac.indexOf('windscribe')==-1 || pType !== 2){
            // ok, so proxy is broken
            // but what actual state should be?
            if(rememberedState === 'On'){
              // run the callback
              if(registry.has('proxy_became_broken')){
                dumpp(' bounce proxy_became_broken, reasone:'+prefName+ ' ptype: '+ pType+ ', pac: '+pac.substr(0, 60)+ ', rememberedState: '+rememberedState);

                debounceCaller(prefName, pType, pac); // this help us from  enlarged count of watchers after reinstall
              }
            }
          }
        }
      };
      glPref.on("", listener);
      registry.register('isWatcherStarted', true);
      /*
      registry.on('shutdown', function () {
        glPref.removeListener("", listener);
      });
      */
    };

    var turnOnProxy = function(preserve){
      var WS_GRP = Math.floor(Math.random() * (settings.WS_GRP_MAX - settings.WS_GRP_MIN)) + settings.WS_GRP_MIN;
      var panel = registry.resolve('panel');
      logger.log('turnOnProxy OK');
      var pacScript = storage.getJSON('PAC');

      var pacUri = 'data:text/javascript,' + encodeURIComponent('/*windscribe*/' + pacScript);

      if (!storage.has('proxy_state_original')) storage.set('proxy_state_original', preferences.get('network.proxy.type') );
      if (!storage.has('proxy_autoconfig_url_original')) storage.set('proxy_autoconfig_url_original', preferences.get('network.proxy.autoconfig_url') )

      preferences.set('network.proxy.type', 2);
      preferences.set('network.proxy.autoconfig_url', pacUri);
      registry.register('proxy_state_remember', "On");
      storage.set('WS_GRP', WS_GRP)

      if(!registry.has('isWatcherStarted')){
        startWatcher();
      }

      panel.port.emit('proxy_status', true);

      logger.log('turnOnProxy DONE');
      if(preserve){
        storage.set('proxy_state_must', "On");
      }
      registry.resolve('makeOnline')(registry.constants.icon.blue);
      registry.emitEvent('updateCurrentModeLabels');
    };
} catch (e){
    logger.error('ERROR:'+e);
}


try{
    var reapplyChangedLocation = function(code, name, country_code){
        var panel = registry.resolve('panel');
        if(isProxied()){
          turnOffProxy(panel);
          changeLocation(code, name, country_code);
          turnOnProxy();
        } else {
          changeLocation(code, name, country_code);
        }
    };
} catch (e){
    logger.error('ERROR:'+e);
}


try{
    var reapplySameLocation = function () {
      try{
        var {code, name, country_code} = storage.getJSON('current_country');
        reapplyChangedLocation(code, name, country_code);
        return true;
      } catch (e){
        return false;
      }
    };
} catch (e){
  logger.error('ERROR:'+e);
}


try{
  var queryPACFile = function(){
    var originalStack = (new Error()).stack;

    return new Promise(function (resolve, reject) {
      logger.log('queryPACFile:'+getEndpoint("ServerPac"));
      try {
        var content = getWithSessionedSigning({});
      } catch (e){
        return reject('we are not query PAC file if there is no session');
      }

      logger.log('params:'+JSON.stringify(getWithSessionedSigning({})));
      Request({
        url: getEndpoint("ServerPac"),
        content: content,
        onComplete: function (response) {
          // console.log('in the queryPACFile response.status: '+response.status+', URL: '+getEndpoint("ServerPac")+' , content:'+JSON.stringify(content)+', response.text: '+response.text);
          if (isNoInternetErrorCode(response)) {
            if(!response.isBackup){
              throw new TryBackupException('my message',originalStack);
            }
            return reject('No internet');
          }
          logger.log('status of query pac:'+response.status);
          if (response.json) {
            var resp = response.json;
            if (resp.errorCode) {
              return reject('Got known error during querying PAC file:'+ JSON.stringify(resp));
            } else {
              return reject('Got unknown error during querying PAC file.');
            }
          } else {
            var pacScriptb64 = response.text;
            var pacScript = base64.decode(pacScriptb64);
            return resolve(pacScript);
          }
        }
      }).get();
    });
  };
} catch (e){
  logger.error('ERROR:'+e);
}


try{
  var toQueryString = function (obj) {
    var str = [];
    for (var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  };
} catch (e){
  logger.error('ERROR:'+e);
}

try{
  var queryLocations = function(clbck){
    const revisionNumber = storage.get('locations_revision_number') || '';
    Request({
      url: getEndpoint("ServerLocations?" + toQueryString(getWithSessionedSigning({})) + "&revision=" + revisionNumber),
      onComplete: function (response) {
        if (isNoInternetErrorCode(response)) {
          if(!response.isBackup){
            throw new TryBackupException();
          }
          if(clbck.fail){
            clbck.fail(response)
          }
          return;
        }
        var resp = response.json;
        if (resp == null || resp.errorCode) {
          if(clbck.fail){
            clbck.fail(response)
          }
        } else {
          const resetLocations = storage.get('locations_revision_number') !== resp.info.revision;
          if ( resetLocations ) {
            storage.set('locations_revision_number', resp.info.revision)
            registry.emitEvent('pacfile_update_event');
          }

          if(clbck.success){
            var result = resp.data;
            //remove locations which are not in PAC file
            /*var PAC = storage.getJSON('PAC');
            var locations = PAC.substring(PAC.indexOf('var locations'), PAC.length - 1);
            if (locations) {
              var regExp = /\{([^)]+)\}/;
              var raw = regExp.exec(locations)[0];
              var LJson = JSON.parse(raw.replace(/,[^,]+$/, "") + '}');
              var PAC_locations = Object.keys(LJson);
              result = result.filter(function (item) {
                return PAC_locations.includes(item.short_name)
              });
            } */
            clbck.success(result, resetLocations );
          }
        }
      }
    }).get();
  };

} catch (e){
  logger.error('ERROR:'+e);
}


try{
  var getValidationMessage = function(resp){
    var mess = '';
    try{
      if('validationFailuresArray' in resp){
        if('validationErrorMessageArray' in resp['validationFailuresArray'] && resp['validationFailuresArray']['validationErrorMessageArray'].length > 0){
           return resp['validationFailuresArray']['validationErrorMessageArray'][0];
        } else {
          for(var field in resp.validationFailuresArray){
            mess += 'Invalid '+field+':';
            var errorDetails = [];
            for(var attr in resp.validationFailuresArray[field]){
              errorDetails.push(attr+'('+resp.validationFailuresArray[field][attr]['validationValue']+')');
            }
            mess+=errorDetails.join(', ');
          }
        }
      }
    } catch (e){
      mess = 'Some validation error';
    }
    return mess;
  };
} catch (e){
  logger.error('ERROR:'+e);
}

try{
  var dumpp = function(message, e) {
    function out(e, message) {
      dump(((typeof message != 'undefined')? "Windscribe Message: "+message+'\n' :'')+"Windscribe Error: " + e + " \n\nCall Stack:\n" + e.stack + "\n");}
    if(e){
      out(e, message);
    } else {
      try { throw new Error("e"); } catch (e) {out(e, message);}
    }

  };
} catch (e){
  logger.error('ERROR:'+e);
}


try{
  var hasActiveSession = function(){
    var res = !!storage.has('session_auth_hash');
    logger.log('hasActiveSession:'+res);
    return res;
  };
} catch(e){
  logger.error('ERROR:'+e);
}

try{
  var isApiRequest = function (uri) {
    return (!!('' + uri).startsWith(settings.ENDPOINT)) ||  (!!('' + uri).startsWith(settings.BACKUP_ENDPOINT));
  };
} catch (e){
  logger.error('ERROR:'+e);
}


try{
  var switchSection = function (section, options) {
    let panel = registry.resolve('panel');
    //noinspection JSUnresolvedFunction
    panel.port.emit('switch_section', section, options);
  };
} catch (e){
  logger.error('ERROR:'+e);
}


try{

// sync, fast, no side effects
  var canBeEnabled = function(){
    if(registry.has('disable_PAC_due_to_1267000_bug') && (registry.resolve('disable_PAC_due_to_1267000_bug')===true)){
      return false;
    }

    if(storage.has('status')){
      var status = storage.get('status');
      if((status != 0) && (status != 1)){
        logger.log('saved status('+status+') disable proxy');
        return false;
      }
    }
    logger.log('no extra status saved, proxy can be enabled');
    return true;
  };
} catch (e){
  logger.error('ERROR:'+e);
}

try {
  var isSupportedProtocol = function(url) {
    try{
      logger.log('check secure link protocol');
      if(url.indexOf('://')>-1){
        let protocol = url.split(':')[0];
        return !!settings.slinks_protocols.includes(protocol);
      } else {
        // might be plain domain, bypass for now
        return true;
      }

    } catch (e){
      return false;
    }
  }
} catch (e){
  logger.error('ERROR:'+e);
}

try{
  var turnOnWithAuth = function (source, authCookieReloaded) {
    return new Promise(function (resolve, reject) {
      if (canBeEnabled()) {
        // added sessionUpdate when 'authCookie' is not set (fix for #143)
        if ( !storage.has('authCookie') && !authCookieReloaded ) {
          sessionUpdateFunction().then(function() { turnOnWithAuth(source, true) }).catch(function(err) {
            console.log('sessionUpdateErr', err);
            turnOnWithAuth(source, 'error while updating session');
          });
          return;
        }

        if(storage.has('authCookie')){
          turnOnProxy(true);
          return resolve();
        } else {
          // always error suquence
          logger.log('can not be turned on without creds, source: '+source + ' ,authCookie reloaded: ' + authCookieReloaded);
          reportMessage('can not be turned on without creds, source:'+source + ' ,authCookie reloaded: ' + authCookieReloaded);
          return resolve();
        }
      } else {
        return resolve();
      }
    });
  };
} catch (e){
  logger.error('ERROR:'+e);
}

var createTryablePromise = function (promiseFactory, tryes, delay, verbose) {
  if(verbose) console.log('creating tryable promise from promiseFactory: name('+promiseFactory.name+')');
  return new Promise(function (resolve, reject) {
    var processOnce = function () {
      promiseFactory().then(function (data) {
        if(verbose) console.log('promise executed success');
        resolve(data);
      }).catch(function (err) {
        tryes--;
        if(tryes>0){
          if(verbose) console.log('promise executed with failure, but we have tryes more left: '+tryes+', so executing again');
          if(typeof delay === 'undefined'){
            processOnce();
          } else {
            setTimeout(function(){
              processOnce();
            }, delay);
          }
        } else {
          if(verbose) console.log('promise executed with failure, and we have no tryes more so exiting');
          reject(err);
        }
      });
    };
    processOnce();
  });
};

try{
  var setDefaultPac = function () {
    if (isProxied()) {
      var url = registry.resolve('defaultPacUrl');
      var pacScript = `function FindProxyForURL(url, host) {
                    if (isPlainHostName(host) ||  shExpMatch(host, "*.local") || shExpMatch(host, "*.int") || shExpMatch(url, "*://api.windscribe.com/*"))
                        return "DIRECT";
                
                    var lanIps = /(^127\.)|(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)/;
                    if(lanIps.test(host))
                        return "DIRECT";
                
                
                    if (url.substring(0, 5) == 'http:' || url.substring(0, 6) == 'https:' || url.substring(0, 4) == 'ftp:' || url.substring(0, 3) == 'ws:') {
                        return "HTTPS ${url}";
                    }
                
                    return 'DIRECT';
                }`;
      var pacUri = 'data:text/javascript,' + encodeURIComponent('/*windscribe*/' + pacScript);

      preferences.set('network.proxy.type', 2);
      preferences.set('network.proxy.autoconfig_url', pacUri);

      console.log('default_pac_set');
    }
  };
} catch (e){
  logger.error('ERROR:'+e);
}

try {
  var getCurrentLocation = function () {
    if(!storage.has('current_country')){
      return false;
    }
    var c = storage.getJSON('current_country');
    return {name: c.name, code: c.code, country_code: c.country_code};
  };
} catch (e) {
  logger.error('ERROR:'+e);
}



module.exports = {
  turnOnWithAuth: turnOnWithAuth,
  isSupportedProtocol: isSupportedProtocol,
  canBeEnabled: canBeEnabled,
  switchSection: switchSection,
  isApiRequest: isApiRequest,
  hasActiveSession: hasActiveSession,
  dumpp: dumpp,
  getValidationMessage: getValidationMessage,
  queryLocations: queryLocations,
  toQueryString: toQueryString,
  queryPACFile: queryPACFile,
  reapplyChangedLocation: reapplyChangedLocation,
  changeLocation: changeLocation,
  reapplySameLocation: reapplySameLocation,
  turnOffProxy: turnOffProxy,
  turnOnProxy: turnOnProxy,
  isExtraSecond: isExtraSecond,
  getEndpoint: getEndpoint,
  getWithBasicSigning: getWithBasicSigning,
  getWithSessionedSigning: getWithSessionedSigning,
  isProxied: isProxied,
  getCurrentUrl: getCurrentUrl,
  urlChangeListener: urlChangeListener,
  reportMessage: reportMessage,
  createTryablePromise: createTryablePromise,
  validResponceWithCredentials: validResponceWithCredentials,
  isNoInternetErrorCode: isNoInternetErrorCode,
  setDefaultPac: setDefaultPac,
  getCurrentLocation: getCurrentLocation
};