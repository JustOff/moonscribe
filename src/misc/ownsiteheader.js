var settings = require('./../settings.js');

module.exports = {
  maybeAddCustomHeader: function(httpChannel){

    var requestHost = httpChannel.URI.asciiHostPort;
    if(!requestHost){
      return;
    }
    requestHost = ''+requestHost;

    var needToDo = false;
    for(let i = 0; i< settings.EXTRHDRS.length; i++){
      if(settings.EXTRHDRS[i].test(requestHost)){
        needToDo = true;
        break;
      }
    }

    if(needToDo){
      httpChannel.setRequestHeader('WS-EXTENSION', '1', false);
    }

    requestHost = null;

  }
};