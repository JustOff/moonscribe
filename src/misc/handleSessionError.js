// called on login if session gets invalid, also is a handler for sessionUpdate error
var registry = require('./../registry.js');
var {reportMessage, getValidationMessage, turnOffProxy} = require('./../common_helpers.js');
var logger = new (require('./logger.js'))(['main']);



var handleSessionError = function (resp, mode) {
  var panel;
  if(registry.has('panel')){
    panel = registry.resolve('panel');
  } else {
    reportMessage('panel is not exists at this moment, something wrong with flow, this should not happened');
    return;
  }
  if( resp.errorCode == 701/* submitted session is invalid*/){
    registry.emitEvent('doLogout');
    return;
  } else if(resp.errorCode == 703 || resp.errorCode == 702 /* Could not log in with provided credentials*/){
    panel.port.emit('login_error', {mess:'Could not log in with provided credentials', mode: mode});
    return;
  } else if(resp.errorCode == 502 /* validation error */){
    logger.log('Could not log in with provided credentials');
    var mess = getValidationMessage(resp);
    panel.port.emit('login_error', {mess: mess, mode:mode});
    return;
  }
  // reportMessage('Some error:' + response.text);
  logger.log('user login(error code):'+resp.errorCode);
  turnOffProxy(false, true);
};

module.exports = handleSessionError;
