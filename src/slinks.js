var logger = new (require('./misc/logger.js'))(['main']);

var {Request, TryBackupException} = require("./misc/request.js");
var clipboard = require("sdk/clipboard");
var storage = require('./storage.js');
var {getCurrentUrl, isSupportedProtocol, reportMessage, getWithSessionedSigning, getEndpoint, isNoInternetErrorCode} = require('./common_helpers.js');

var SLinks = function(){};

SLinks.prototype.create = function(url, clbck){
    logger.log('getEndpoint("SecureLinks"):'+getEndpoint("SecureLinks"));
  logger.log('getWithSessionedSigning({url: url}):'+JSON.stringify(getWithSessionedSigning({url: url})));
    Request({
      url: getEndpoint("SecureLinks"),
      content: getWithSessionedSigning({url: url}),
      onComplete: function (response) {
        if (isNoInternetErrorCode(response)) {
          if(!response.isBackup){
            throw new TryBackupException();
          }
          clbck({success: false, error: 'No internet'});
          return;
        }

        logger.log('slinks: '+ response.text);
        var resp = response.json;
        if (resp.errorCode) {
          clbck({success: false, error: resp});
          return;
        } else {
          clbck({success: true, data: resp.data});
          return;
        }
      }
    }).post();
};

var findIndexByItemId = function(arr, itemId){
  for(var i = 0; i<arr.length; i++){
    if(arr[i].secure_link_display_id == itemId){
      return i;
    }
  }
  return -1;
};

SLinks.prototype.bindListeners = function(panel){
  var me = this;
  panel.port.on('slinks_update', function(data){
    try{
      var content = getWithSessionedSigning({});
      if(!!data.passw) content.password = data.passw;
      if(!!data.descr) content.message = data.descr;
      if(typeof data.isInstall !== 'undefined') content.force_install = data.isInstall?"1":"0";
      Request({
        url: getEndpoint("SecureLinks/"+data.id),
        content: content,
        onComplete: function(response){
          if (isNoInternetErrorCode(response)) {
            if(!response.isBackup){
              throw new TryBackupException();
            }
          }

          logger.log('link update success'+JSON.stringify(data));

          if(('mode' in data) && (data.mode == 'context')){
            logger.log('is context update, send message for close');
            panel.hide();
          } else {
            logger.log('is from extension update, send message for switch to main');
            panel.port.emit('switch_section', 'main');
          }
        }
      }).put();

    } catch (e){
      logger.log('error is here:'+e)
    }
  });
  
  panel.port.on('slinks_create', function(url){

      if(!isSupportedProtocol(url)) return;

      var clbck = function(res){
        if(res.success){
          logger.log('link success:'+ res.data);
          panel.port.emit('slinks_ready', res.data);
          clipboard.set(res.data.secure_url);
          // 
        } else {
          if((res.error && typeof res.error === Object.prototype) && ('validationFailuresArray' in res.error) && ('url' in res.error.validationFailuresArray)){
            reportMessage('Invalid URL');
          } else {
            if(res.error === 'No internet') {
              reportMessage(res.error + ' connection');
            }
            else reportMessage(res.error);
          }
          panel.port.emit('slinks_ready', false);
        }
      };

      me.create(url, clbck);
      
      
	});
var recent_links_update_ui = function () {
  panel.port.emit('recent_links_update_ui_start');
  logger.log('update recent list start');
  Request({
    url: getEndpoint("SecureLinks"),
    content: getWithSessionedSigning({}),
    onComplete: function (response) {
      if (isNoInternetErrorCode(response)) {
        if(!response.isBackup){
          throw new TryBackupException();
        }
        panel.port.emit('switch_section', 'main');
      }
      var resp = response.json;
      if(!resp) return;
      if (resp.errorCode) {
        if(resp.errorCode == '1001'){
          panel.port.emit('recent_links_update_ui_done', []);
          logger.log('update recent list ends(empty data)');
          return;
        }
        // do better error handling
        panel.port.emit('switch_section', 'main');
        return;
      } else {
        panel.port.emit('recent_links_update_ui_done', resp.data);
        logger.log('update recent list ends');
        return;
      }
    }
  }).get();
};
  panel.port.on('recent_links_update_ui', recent_links_update_ui);

  panel.port.on('recent_links_copy_link', function(link){
    clipboard.set(link);
  });

  panel.port.on('recent_links_remove_link', function(id){
    Request({
      url: getEndpoint("SecureLinks/"+id),
      content: getWithSessionedSigning({}),
      onComplete: function (response) {
        if (isNoInternetErrorCode(response)) {
          if(!response.isBackup){
            throw new TryBackupException();
          }
          panel.port.emit('switch_section', 'main');
        }
        var resp = response.json;
        if (resp && resp.errorCode) {
          // do better error handling
          panel.port.emit('switch_section', 'main');
          return;
        } else {
          recent_links_update_ui();
          logger.log('delete recent list ends');
          return;
        }
      }
    }).delete();
  });


};

module.exports = SLinks;
