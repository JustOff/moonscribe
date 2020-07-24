var registry = require('./../registry.js');
var storage = require('./../storage.js');
var logger = new (require('./logger.js'))(['auth']);
var {turnOnProxy, turnOffProxy, isNoInternetErrorCode, getCurrentUrl, switchSection, queryPACFile, canBeEnabled, turnOnWithAuth, reportMessage, queryLocations, getEndpoint, getWithSessionedSigning, createTryablePromise, validResponceWithCredentials, reapplySameLocation} = require('./../common_helpers.js');
var { startSessionUpdate, stopSessionUpdate, sessionUpdateFunction } = require('./sessionupdate.js');
var {Request, TryBackupException} = require("./request.js");
var base64 = require("sdk/base64");
var settings = require('./../settings.js');

// entry point 1
registry.onEvent('checkActiveSessions', function(){
  // add check for all required data
  var res = !!storage.has('session_auth_hash');
  logger.log('checkActiveSessions:'+res);
  if(res){
    loginWithStoredCredentials(false);
  }
});

// entry point 2
registry.onEvent('loginWithStoredCredentials', function(cleanRun){
  loginWithStoredCredentials(cleanRun);
});



var loginWithStoredCredentials = function (cleanRun) {
    var debug = false;
    var exit = {}; // exit marker, after rejecting with it nothing else in chain should be called

    if(debug) console.log("");
    var tries = 3;

    // first parametr is a promise factory
    var flow = createTryablePromise(pingSessionAndMaybeGetDeviceId, tries, 500, debug);

    flow.catch(function () {
      if(debug) console.log('got an error during getting DeviceId, throwing user to hello screen');
      registry.emitEvent('switchToDefaultScreen', 'Some problem with login.');
      return Promise.reject(exit);
    });



    flow = flow.then(function () {
      if(debug) console.log('checkpoint, processing further');
      return Promise.resolve();
    });


    flow = flow.then(function () {
      if(debug) console.log('loginWithStoredCredentials after successful getting DeviceId, trying to apply PAC async');
      logger.clone(['blocker']).log('running loginWithStoredCredentials, cleanRun:'+ cleanRun);
      var applyed = applyCachedPACIfMust(cleanRun);
      if(debug) console.log('applyCachedPACIfMust ends, result: '+applyed);
      return Promise.resolve(applyed);
    });

    flow = flow.then(function (applyed) {
      if(debug) console.log("applying PAC async start ");

      var handlerAfter = function () {
        if(debug) console.log("handle after");
        if(storage.has('proxy_state_must') && storage.get('proxy_state_must') == "On") {
          startSessionUpdate();
        } else {
          sessionUpdateFunction();
        }
        registry.emitEvent('url_changed', getCurrentUrl());
        if(registry.has('restart_required') && registry.resolve('restart_required') === true){
          registry.resolve('makeOnline')(registry.constants.icon.error);
          switchSection('restart_required');
        } else {
          switchSection('main');
        }
        return Promise.resolve();
      };

      if(applyed){
        return applyPACAsync().then(function () {
          if(debug) console.log("applyed: true, applyPACAsync ok, now handlerAfter");
          return handlerAfter();
        });
      } else {
        return handlerAfter().then(function () {
          if(debug) console.log("applyed: false, applyPACAsync ok, now handlerAfter");
          return applyPACAsync();
        });
      }
    });

    flow = flow.catch(function (err) {
      if(debug) console.log("stored login came to error, "+err);
      if(err === exit){
        if(debug) console.log("this is exit error");
        return Promise.reject(exit); // this is another error, already handled
      }
      if(debug) console.log('stored login error BUT not an exit');
      if(!storage.has('PAC')){
        if(debug) console.log('Problem getting PAC file, none cached, reject whole flow');
        registry.emitEvent('switchToDefaultScreen', 'Problem getting PAC file, none cached');
        return Promise.reject();
      } else {
        // at least we have something cached
        if(debug) console.log('we are in error case, but resolving true bcose we do have PAC file');
        return Promise.resolve();
      }
    });

    flow = flow.then(function () {
        logger.log('we are after applyPACAsync, and clean run is: '+cleanRun);
        return turnOnIfCleanRun(cleanRun);
    });

    flow.then(null, function (e) {
      console.log('ERROR: '+e);
    });
};


var pingSessionAndMaybeGetDeviceId = function () {
  return new Promise(function (resolve, reject) {
    logger.log('pingSessionAndMaybeGetDeviceId so it is called');
    // should not be called twice
    var data = getWithSessionedSigning({});

    // console.log('url:'+ getEndpoint("Session")+', data: '+JSON.stringify(data));
    Request({
      url: getEndpoint("ServerCredentials"),
      content: data,
      onComplete: function (response) {
        if (isNoInternetErrorCode(response)) {
          if(!response.isBackup){
            throw new TryBackupException();
          }
        }

        // console.log('so error here, response.status: '+response.status+', response.isBackup: '+response.isBackup);
        if(response.status !== 200){
          console.log('bad way device');
          return reject(response);
        } else {
          var resp = response.json;
          if(resp.errorCode){
            return reject(response);
          } else {
              if(validResponceWithCredentials(response)){
                logger.log('good way device')
                var ext_username = base64.decode(resp.data.username);
                var ext_password = base64.decode(resp.data.password);
                storage.set('authCookie', base64.encode(ext_username + ":" + ext_password));
                return resolve();
              } else {
                return reject(response);
              }
          }
        }
      }
    }).get();
  });
};


// fast n sync operation with side effect
// todo: change to promise?
var applyCachedPACIfMust = function(cleanRun){
  if(!storage.has('api_endpoint')){
    // set for future and ignore once
    storage.setJSON('api_endpoint', settings.ENDPOINT);
    return false;
  } else {
    var endpointFromStorage = storage.getJSON('api_endpoint');
    if(settings.ENDPOINT != endpointFromStorage){
      // not apply obsolete pac file this time, but upgrade endpoint
      storage.reset('PAC');
      storage.setJSON('api_endpoint', settings.ENDPOINT);
      return false;
    }
  }

  if(storage.has('PAC')){                                       // <== if applicable at all
    logger.log('work with cached PAC file');
    if((storage.has('proxy_state_must') && (storage.get('proxy_state_must') == "On")) || cleanRun){
      logger.log('start proxy - was saved state');
      if(canBeEnabled()){                                       // <== actual checking
        logger.log('proxy can be enable, so enabling it');
        turnOnProxy();                                          // <== actual action
        return true;
      } else {
        logger.log('cached PAC present and proxy must be onn, but not apply due to other reason');
        return false;
      }
    } else {
      logger.log('cached PAC present but proxy must be off');
      return false;
    }
  } else {
    logger.log('no cached proxy, so nothing to apply, go next');
    return false;
  }

  return false;
};

var turnOnIfCleanRun = function(cleanRun){
  if(cleanRun){
    return turnOnWithAuth('loginWithStoredCredentials, on clean run');
  } else {
    return Promise.resolve();
  }
};

var applyPACAsync = function () {
  var factory = function () {
    return new Promise(function (resolve, reject) {
      logger.log('applyPACAsync start');
      queryPACFile().then(function (pacScript) {
        logger.log('pacScript:'+pacScript);
        storage.setJSON('PAC', pacScript);
        storage.setJSON('originalPAC', pacScript);

        // preserving saved location

        processLocationForPAC(pacScript);

        // start proxy if was saved state
        if(storage.has('proxy_state_must') && (storage.get('proxy_state_must') == "On")){
          if(canBeEnabled()){
            turnOnProxy();
          }
        }

        return resolve();

      }).catch(function (message) {
        logger.log('getPACFileHandler.fail, proxy will be switching off');
        if(!storage.has('PAC') || !storage.has('authCookie')){
          turnOffProxy(false, true);
        }
        reject('deffered.resolved, failed to get PACFile(no cheese for you):'+message);
      })
    });
  };
  return createTryablePromise(factory, 3, 300, false);
};


var processLocationForPAC = function(pacScript){
  if(!registry.has('panel')){
    reportMessage('impossible situation: panel is not exists');
    return;
  }

  var panel = registry.resolve('panel');

  if(storage.has('current_country')){
    logger.log('current_country was present (success)');
    reapplySameLocation();
    var currentCountry = storage.getJSON('current_country');
    panel.port.emit('locations_update_current_ui_done', {name: currentCountry.name, code: currentCountry.code, country_code: currentCountry.country_code});
  } else {
    // or setting default
    var defaultLocation = grabDefaultLocationFromPac(pacScript);
    logger.log('current_country was not present, getting info for default code: ', defaultLocation);
    panel.port.emit('locations_update_current_ui_done', {name:defaultLocation, code: defaultLocation, country_code: defaultLocation});
    if(defaultLocation == 'Automatic'){
      storage.setJSON('current_country', {
        code: 'Automatic', name: 'Automatic'
      });

    } else {
      // but having just country-code is not enough for UI, but PACfile can start
      // successful,as far as it used already defined default location in it
      queryLocations({
        success: function(data){

          logger.log('extended location info grabbed, total records: '+data.length);
          var founded = data.filter(function(el){
            var matches = el.country_code == defaultLocation;
            logger.log('<'+el.country_code+'> is '+((!matches)?'not ':' ')+'mache this: <'+defaultLocation+'>');
            return matches;
          });

          logger.log('there are '+founded.length+' items in extended ifo for our location('+defaultLocation+')');
          if(founded.length>0){
            // assuming that default location is listed in list of all servers
            // if not - add more checking
            var defaultServerInfo =  founded[0];
          } else {
            var defaultServerInfo =  {country_code: defaultLocation, name: defaultLocation, short_name: defaultLocation};
          }
          // todo: refactor here - rename "code" to "short_name" as it is in server response
          storage.setJSON('current_country', {
            code: defaultServerInfo.short_name, name: defaultServerInfo.name, country_code: defaultServerInfo.country_code
          });
          logger.log('update current location UI to this:'+defaultServerInfo.name);
          // update UI
          panel.port.emit('locations_update_current_ui_done', {name: defaultServerInfo.name, code: defaultServerInfo.short_name, country_code: defaultServerInfo.country_code });
        }
      });
    } // getting current server-code for UI
  }
};

var grabDefaultLocationFromPac = function(pacScript){
  if(pacScript.indexOf("var controlMode = 'cr';">-1)){
    return "Automatic"
  } else {
    var matches = pacScript.match(/defaultLocation = '(.*?)';/);
    return matches[1];
  }
};