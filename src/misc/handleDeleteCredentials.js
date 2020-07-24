var registry = require('./../registry.js');
var storage = require('./../storage.js');
var logger = new (require('./logger.js'))(['auth']);
var {getEndpoint, getWithSessionedSigning, getWithBasicSigning, isNoInternetErrorCode} = require('./../common_helpers.js');
var {Request, TryBackupException} = require("./request.js");

var maybeDeleteCredentials = function () {
  return new Promise(function (resolve) {
    let data;

    if(storage.has('session_auth_hash')){
      data = getWithSessionedSigning({});
    } else {
      data = getWithBasicSigning({});
    }

    if(!storage.has('ext_username')){
      return resolve();
    } else {
      data['device_id'] = storage.get('ext_username');
      try{
        Request({
          url: getEndpoint("Session"),
          content: data,
          onComplete: function (response) {
            if (isNoInternetErrorCode(response)) {
              if(!response.isBackup){
                throw new TryBackupException();
              }
              /// console.log('session deleted failed, no internet, will keep it and delete, on login sequence');
            } else {
              // console.log('session deleted fine');
              storage.reset('ext_username');
            }
            storage.reset('authCookie');
            resolve();               // no difference the kind of result(good/bad). will run once again anyway.
          }
        }).delete();

      } catch (e){
        logger.error('unexpected error here', e);
        // in case of error, just successfully resolve
        resolve();
      }
    }
  });
};

module.exports = maybeDeleteCredentials;