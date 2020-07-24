var { handleTrafficStatus, saveTrafficStatus  } = require('./handleTrafficStatus.js');
var registry = require('./../registry.js');
var settings = require('./../settings.js');
var storage = require('./../storage.js');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");

var logger = new (require('./logger.js'))(['main']);

var {Request, TryBackupException} = require("./request.js");
const { getWithSessionedSigning, getEndpoint, isNoInternetErrorCode, 
    validResponceWithCredentials, changeLocation, turn } = require('./utils');

const { setOurLocationAsCurrent } = require('./utils.js');

var base64 = require("sdk/base64");


var sessionUpdateInterval = settings.INTERVALS.SESSION_UPDATE;
var sessionUpdateIntervalId, sessionUpdateScheduled = false;


var locationsUpdateFunction = function (ourLocationCode) {
  logger.log('locationsUpdateFunction timer');

  setOurLocationAsCurrent()
  registry.emitEvent('locations_update_event', true);
};

var sessionUpdateFunction = function() {
  return new Promise(function (resolve, reject) {
    try{
      var content = getWithSessionedSigning({session_type_id: '2'});
      if(storage.has('ext_username')){
        content.device_id = storage.get('ext_username');
      }

      Request({
        url: getEndpoint("Session"),
        content: content,
        onComplete: function (response) {
          if (isNoInternetErrorCode(response)) {
            if(!response.isBackup){
              throw new TryBackupException();
            }
            registry.register('defaultPacUrl', settings.DEFAULT_PAC_ENDPOINT)
            // nothing to do here anyway
            return;
          }

          if ( response.isBackup ) {
            registry.register('defaultPacUrl', settings.BACKUP_DEFAULT_PAC_ENDPOINT)
          } else { registry.register('defaultPacUrl', settings.DEFAULT_PAC_ENDPOINT) };

          // console.log('delete session via this request: '+JSON.stringify(getWithSessionedSigning({
          //     device_id: storage.get('ext_username')
          //   }))+'  to this endpoint:'+getEndpoint("Session"));

          var res = response.json;
          if (res.errorCode) {
            if(res.errorCode == 701){
              if(!storage.has('failedUpdateSessionCounter')){
                storage.set('failedUpdateSessionCounter', 0);
              }
              var failedUpdateSessionCounter = storage.get('failedUpdateSessionCounter');
              // console.log('failedUpdateSessionCounter:'+failedUpdateSessionCounter);
              if(failedUpdateSessionCounter<9){
                failedUpdateSessionCounter++;
                storage.set('failedUpdateSessionCounter', failedUpdateSessionCounter);
                // console.log('failedUpdateSessionCounter is '+failedUpdateSessionCounter);
              } else {
                // console.log('failedUpdateSessionCounter is tooo big, exiting');
                registry.emitEvent('doLogout');
              }

            } else {
              registry.emitEvent('postGetSessionError', response);
            }
          } else {
            storage.set('failedUpdateSessionCounter', 0); // reset error counter
            saveTrafficStatus(res.data);
            handleTrafficStatus();

            const resetLocations = storage.get('locations_revision_number') !== res.data.loc_rev;
            if ( resetLocations ) {
              locationsUpdateFunction(true /*fetchFreshData*/)
            }
            registry.emitEvent('checkMode');
            
            storage.get('proxyBeforeOurLocation') && !res.data.our_ip && !res.data.our_location && registry.emitEvent('restoreAppAfterOurLocationLeft');

          }
          resolve()
        }
      }).get();
    } catch (e){
      logger.error('error '+e);
      reject(e);
    }
  } )
}

registry.onEvent('postGetSessionError', function(res){
  if(!res) {
    return;
  }
  var e = res.json.errorMessage;
  logger.log('postGetSessionError:'+ e);
});

var startSessionUpdate = function () {
  if (!sessionUpdateScheduled) {
    sessionUpdateFunction();
    sessionUpdateIntervalId = setInterval(sessionUpdateFunction, sessionUpdateInterval);
    sessionUpdateScheduled = true;
  }
};

var stopSessionUpdate = function () {
  if (sessionUpdateScheduled) {
    logger.log('clearInterval(sessionUpdateIntervalId)');
    clearInterval(sessionUpdateIntervalId);
    sessionUpdateScheduled = false;
  }
};


exports.startSessionUpdate = startSessionUpdate;
exports.stopSessionUpdate  = stopSessionUpdate;
exports.sessionUpdateFunction  = sessionUpdateFunction;
