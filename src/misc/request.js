var OriginalRequest = require("sdk/request").Request;
var {BACKUP_ENDPOINT, ENDPOINT, ASSETS_ENDPOINT, BACKUP_ASSETS_ENDPOINT } = require('./../settings.js');


var TryBackupException = (function() {
  var TryBackupException, err;
  TryBackupException = (function() {
    function TryBackupException(message, stack) {
      var err;
      err = new Error(message);
      err.name = "TryBackupException";
      this.message = err.message;
      this.causeStack = stack;
      if (err.stack) this.stack = err.stack;
    }
    return TryBackupException;
  })();
  err = new Error();
  err.name = "TryBackupException";
  TryBackupException.prototype = err;
  return TryBackupException;
}).call(this);

var replaceUrl =  function (originalUrl) {
  var replaced;
  if(originalUrl.startsWith(ENDPOINT)){
    replaced = originalUrl.replace(ENDPOINT, BACKUP_ENDPOINT);
    // console.log('happened to replace originalUrl('+originalUrl+') to replaced('+replaced+')');
    return replaced;
  } else if (originalUrl.startsWith(ASSETS_ENDPOINT)) {
    replaced = originalUrl.replace(ASSETS_ENDPOINT, BACKUP_ASSETS_ENDPOINT);
    return replaced;
  } else {
    // console.log('replace url called but not worked: originalUrl('+originalUrl+')');
  }
  return originalUrl;
};

var Request = function (options) {
  var originalOnComplete = options.onComplete;

  // magic live here
  var returnChangedrequest = function (method) {
    var optionsCopy = Object.assign({}, options);
    return OriginalRequest(Object.assign(optionsCopy, {
      onComplete: function (response) {
        try{
          response.isBackup = false;
          originalOnComplete(response)
        } catch (e){
          if(e.name == 'TryBackupException'){
            var freshOptionsCopy = Object.assign({}, options);
            // console.log('replace URL for: '+JSON.stringify(options)+'from '+(new Error()).stack+', calling code: '+freshOptionsCopy.onComplete.toString()+', cause stack = '+e.causeStack);
            freshOptionsCopy.url = replaceUrl(freshOptionsCopy.url);
            var oldOnComplite = freshOptionsCopy.onComplete;
            freshOptionsCopy.onComplete = function (response) {
              response.isBackup = true;
              oldOnComplite(response)
            };
            OriginalRequest(freshOptionsCopy)[method]();
          } else {
            throw e;
          }
        }
      }
    }));
  };


  return {
    "get" : function () {
      returnChangedrequest('get').get();
    },
    post: function () {
      returnChangedrequest('post').post();
    },
    delete: function () {
      returnChangedrequest('delete').delete();
    }
  };
}

module.exports = {
  Request: Request,
  TryBackupException: TryBackupException
};




