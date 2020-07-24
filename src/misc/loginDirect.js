var registry = require('./../registry.js');
var storage = require('./../storage.js');

var {switchSection, getEndpoint, getWithBasicSigning, isNoInternetErrorCode} = require('./../common_helpers.js');
var {Request, TryBackupException} = require("./request.js");

var logger = new (require('./logger.js'))(['auth']);
var handleSessionError = require('./handleSessionError.js');
var { handleTrafficStatus, saveTrafficStatus  } = require('./handleTrafficStatus.js');
var maybeDeleteCredentials = require('./handleDeleteCredentials.js');



registry.onEvent('login', function (data) {

  var exit = {}; // exit marker
  switchSection('loader');
  logger.log('action_user_login event with:' + data);

  if(!data) return;

  var flow = maybeDeleteCredentials();

  flow = flow.then(function () {
    return doActualLogin(data);
  });

  flow = flow.then(function ({response, mode}) {
    return processLoginOutput({response, mode});
  });

  flow = flow.then(function ({response, mode}) {
    return postGetSessionSuccess(response, mode);
  });

  flow = flow.catch(function (e) {
    return processLoginError(e, exit); // break the chain
  });

  flow.then(function () {
    console.log('end of login process good');
  }, function (e) {
    console.log('Unhandled error on XZ:'+e, (e.stack?e.stack:('no stack, '+(JSON.stringify(e)))));
  });
});


var processLoginOutput = function ({response, mode}) {
  var resp = response.json;

  return new Promise(function (resolve, reject) {
    logger.log('processLoginOutput starts('+mode+'): '+response.text);

    if (response.status === 0) {
      return reject({mess: 'No internet', mode:mode});
    }  else if(response.status>399){
      if (resp) {
        if (resp.errorCode === 502) return reject({mess: "Could not log in with provided credentials", mode:mode});
        else return reject({mess: resp.errorMessage, mode:mode});
      }
      else return reject({mess: 'Server error '+response.status+' code', mode:mode});
    }
    logger.log('processLoginOutput handler status:'+response.status);
    if (resp.errorCode) {
      handleSessionError(resp, mode);
      reject('done');
    } else {
      resolve({response, mode}); // postGetSessionSuccess
    }
  });
};


var doActualLogin = function (data) {
  return new Promise(function (resolve, reject) {
    var content = getWithBasicSigning({
      username: data.name,
      password: data.passw,
      session_type_id: '2'
    });

    logger.log('action_user_login ready to request');

    //noinspection JSUnresolvedFunction
    Request({
      url: getEndpoint("Session"),
      content: content,
      onComplete: function (response) {
        if (isNoInternetErrorCode(response)) {
          if(!response.isBackup){
            throw new TryBackupException();
          }
        }
        logger.log('POST to create new session ends');
        resolve({response, mode: (data.signup)?'signup':'login'});
      }
    }).post();
  });
};


var processLoginError = function (errorData, exit) {
  var panel = registry.resolve('panel');
  if(errorData !== 'done'){ // if error is not handled yet
     panel.port.emit('login_error', errorData /*{mess: mess, mode:mode}*/);
     return Promise.reject(null); //error handled
  }
  return Promise.reject(exit);
};

var postGetSessionSuccess = function (response, mode) {
  var rData;
  var flow = Promise.resolve();

  flow = flow.then(function () {
    var resp = response.json;
    logger.log(('user login(success):' + response.text).split('\n').join(' '));
    rData = resp.data;
    storage.set('session_auth_hash', rData['session_auth_hash']);
    storage.set('username', rData['username']);
    storage.set('user_id', rData['user_id']);
    saveTrafficStatus(rData);
  });



  flow = flow.then(function () {
    handleTrafficStatus();
    registry.emitEvent('loginWithStoredCredentials', true);
  });

  return flow;
};


