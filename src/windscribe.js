const { Ci, Cu, Cc, Cr, components, Cm} = require('chrome');
var logger = new (require('./misc/logger.js'))(['main']);

var preferences = require("sdk/preferences/service");
var {Request, TryBackupException} = require("./misc/request.js");
var base64 = require("sdk/base64");

var storage = require('./storage.js');
var settings = require('./settings.js');
var registry = require("./registry.js");
let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});
var prefService = require("sdk/preferences/service");

var { reportMessage, urlChangeListener, isNoInternetErrorCode, getWithBasicSigning, getWithSessionedSigning,
    getEndpoint, turnOffProxy, turnOnProxy, reapplyChangedLocation, queryLocations, toQueryString, isProxied,
    getValidationMessage, switchSection, turnOnWithAuth,
    queryPACFile, reapplySameLocation, getCurrentLocation, changeLocation } = require('./common_helpers.js');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");


var { stopSessionUpdate } = require('./misc/sessionupdate.js');
var handleSessionError = require('./misc/handleSessionError.js');

var maybeDeleteCredentials = require('./misc/handleDeleteCredentials.js');

var { isProxyOn  } = require('./misc/networkListener.js');

const { setOurLocationAsCurrent } = require('./misc/utils.js');


var tabs = require('sdk/tabs');



var Windscribe = function (panel/* */) {
    var me = this;
    me.panel = panel;

    registry.onEvent('switchToDefaultScreen', function(message){
      if(settings.register_via_site_only || storage.has('isNotFirstRun')){
        switchSection('login', {message:message});
      } else {
        switchSection('signup', {message:message});
      }
    });

    /* bind UI events */
    // todo: change to one event but with differ parameters for handling same way
    me.panel.port.on('action_user_login', function(data){
       registry.emitEvent('login', data);
    });


    registry.register('proxy_became_broken', function(prefName, pType, pac){
      panel.port.emit('proxy_became_broken');
      registry.resolve('makeOnline')(registry.constants.icon.grey);
    });




    //signUp
    me.panel.port.on('action_user_signUp', function (data) {
      logger.log('action_user_signUp event with:' + data);
      var content = getWithBasicSigning({
        username: data.name,
        password: data.passw,
        session_type_id: '2',
        reg_method:'ext_firefox'
      });

      if (data.email) {
        content.email = data.email;
      }

      Request({
        url: getEndpoint("Users"),
        content: content,
        onComplete: function (response) {
          if (isNoInternetErrorCode(response)) {
            if(!response.isBackup){
              throw new TryBackupException();
            }
            me.panel.port.emit('signup_error', 'No internet connection.');
            return;
          }
          var resp = response.json;
          if (resp.errorCode) {
            registry.emitEvent('signUpError', resp);
          } else {
            registry.emitEvent('signUpSuccess', resp.data.user_id);
            registry.emitEvent('login', {name: data.name, passw: data.passw, signup: true});
          }
        }
      }).post();
    });

    registry.onEvent('signUpError', function (resp) {

      if(resp && resp.errorMessage) {
          me.panel.port.emit('signup_error', resp.errorMessage);
      } else {
          // no loader - no need to switch UI
          if (resp.errorCode == 503) {
              me.panel.port.emit('signup_error', 'Username is already taken.');
          } else if (resp.errorCode == 600) {
              me.panel.port.emit('signup_error', 'Testing duplicate error.');
          } else if (resp.errorCode == 502) {
              var mess = getValidationMessage(resp);
              me.panel.port.emit('signup_error', mess);
          } else {
              me.panel.port.emit('signup_error', 'Unknown error, try again later.');
          }
      }
    });



    //logout
    me.panel.port.on('action_user_logout', function () {
      me.logout(); //
    });

    registry.onEvent('doLogout', function () {
      me.logout(); //
    });

    registry.onEvent('reloginRequired', function() {
        storage.has('relogin_required') ? switchSection('auth_token_err_relogin') : switchSection('main');
    });

    me.panel.port.on('switch_proxy', function () {
      logger.log('isProxied:' + isProxied());
      if (isProxied()) {
        turnOffProxy(me.panel, true);
      } else {
        turnOnWithAuth('just switch proxy from UI');
      }
    });

    me.panel.port.on("init_popup", function (data) {
      if (isProxied()) {
        me.panel.port.emit('proxy_status', true);
      } else {
        me.panel.port.emit('proxy_status', false);
      }
      me.panel.port.emit('flags', settings.KNOWN_FLAGS);
      me.panel.port.emit('link_data', settings.LNK);
      me.panel.port.emit('setup_register_via_site_only', settings.register_via_site_only);

      if(registry.has('disable_PAC_due_to_1267000_bug') && (registry.resolve('disable_PAC_due_to_1267000_bug')===true)){
          console.log('emiting UI changes');
          me.panel.port.emit('disable_PAC_due_to_1267000_bug');
      }
    });

    me.panel.port.on('signup_via_site', function () {
      tabs.open(settings.EXTERNAL_LOGIN_URL_OPEN_ON_INSTALL);
      me.panel.hide();
    });


    me.panel.port.on('open_new_url', function (url) {
      if(url === settings.LNK.LNK_MY_ACC ){
        let session_auth_hash;
        if(storage.has('session_auth_hash')){
          session_auth_hash = storage.get('session_auth_hash')
        } else {
          session_auth_hash = 'CAFEBABE';
        }
        url = url.replace('{SESSION_PLACEHOLDER}', session_auth_hash);
      }
      tabs.open(url);
      me.panel.hide();
    });

    urlChangeListener(function(url){
      registry.emitEvent('url_changed', url);
    });

    registry.onEvent('url_changed', function (url) {
      me.panel.port.emit('url_changed', url);
    });


    registry.onEvent('pacfile_update_event', function () {
      queryPACFile().then(function (pacScript) {
        storage.setJSON('originalPAC', pacScript);
        reapplySameLocation();
      });
    });

    registry.onEvent('locations_update_event', function (fetchFreshData) {
      if(!storage.has('session_auth_hash')){
        return;
      }
      var isPremium = false;
      if(storage.has('is_premium')){
        isPremium = (storage.get('is_premium') == 1);
      }

      var current = false;
      if(storage.has('current_country')){
        current = storage.getJSON('current_country');
      }
      if(storage.has('location_cache') && !fetchFreshData){
        logger.log('updating UI of locations from cache, current is:'+JSON.stringify(current));
        me.panel.port.emit('locations_update_done', storage.getJSON('location_cache'), isPremium, current);
      } else {
        logger.log('updating UI of locations from server, current is:'+JSON.stringify(current));
        queryLocations({
          success: function(data, resetLocations){
              logger.log('success, render current as'+current);
              logger.log('success, locations:'+JSON.stringify(data));
              if ( resetLocations ) {
                  storage.setJSON('location_cache', data);
                  me.panel.port.emit('locations_update_done', data, isPremium, current);
              } else {
                  me.panel.port.emit('locations_update_done', storage.getJSON('location_cache'), isPremium, current);
              }
          },
          fail: function(response){
          }
        });
      }
    });

    registry.onEvent('restoreAppAfterOurLocationLeft', function() {
        var currentLocation = getCurrentLocation();
        var proxyBeforeOurLocation = storage.get('proxyBeforeOurLocation')
        if (proxyBeforeOurLocation === 'On') {
            changeLocation(currentLocation.code, currentLocation.name, currentLocation.country_code)
            turnOnWithAuth('restoring proxy after our location left')
        } else {
            turnOffProxy(me.panel, true)
        }

        storage.reset('doubleHopSetByUser');
        storage.reset('ourLocationCode');
        storage.reset('proxyBeforeOurLocation');
    })

    me.panel.port.on('locations_update_ui', function () {
      registry.emitEvent('locations_update_event');
    });

    me.panel.port.on('locations_select', function(code, name, country_code){

      ( !storage.get('ourLocationCode') || storage.get('ourLocationCode') === code ) ? storage.set('doubleHopSetByUser', false) : storage.set('doubleHopSetByUser', true);

      reapplyChangedLocation(code, name, country_code);

      registry.emitEvent('checkMode');
      turnOnWithAuth('on locations_select from UI');
      switchSection('main');
    });

    me.panel.port.on('locations_update_current_ui', function(){
      var myLocation = getCurrentLocation();
      if(myLocation === false){
        me.panel.port.emit('locations_update_current_ui_done', '');
      } else {
        me.panel.port.emit('locations_update_current_ui_done', myLocation);
      }
    });



    me.panel.port.on('override_broken_proxy', function(){
      var actualState = registry.resolve('proxy_state_remember');
      if(actualState == 'On'){
        turnOnProxy(false);
      } else /* Its still question if there is else, but for following same logic will add this clause*/{
        turnOffProxy(false);
      }
    });


    me.panel.port.on('update_online_state', function(){
      if(registry.resolve('proxy_state_remember') == 'On' || storage.get('extensionMode') === 'externalApp' ){
        panel.port.emit('proxy_status', true);
      } else {
        panel.port.emit('proxy_status', false);
      }
    });

    me.panel.port.on('click_on_main_location', function(){
      var status = storage.get('status');
      //noinspection EqualityComparisonWithCoercionJS
      if(status == 1 || status == 0){
        switchSection('locations');
      }
    });



    var updateCurrentModeLabelsAndIcon = function (message) {
      if (message === "switchOffDoubleHop") {
          storage.set('extensionMode', 'externalApp');
          storage.reset('doubleHopSetByUser');
          setOurLocationAsCurrent();
      }

      var titles = (function(){
        if(registry.has('restart_required')){
          registry.resolve('makeOnline')(registry.constants.icon.error);
          return [' ', ' ']
        }

          switch (storage.get('extensionMode')) {
              case 'doubleHop':
                  registry.resolve('makeOnline')(registry.constants.icon.doubleHop);
                  return ['Double Hop', 'Desktop app is running. You currently double proxy your traffic. This is more secure, but could be slower'];
              case 'externalApp':
                  // console.log('proxy_state', registry.has('proxy_state_remember') && registry.resolve('proxy_state_remember') )
                  ( ( registry.has('proxy_state_remember') && registry.resolve('proxy_state_remember') === 'On' ) ||
                    storage.get('proxy_state_must') === "On" ) && turnOffProxy(me.panel, true);

                  panel.port.emit('proxy_status', true);
                  registry.resolve('makeOnline')(registry.constants.icon.blue);
                  return ['External App', 'Your network settings are controlled by the Windscribe Desktop App'];
              case 'cruiseControl':
                  isProxyOn() ? registry.resolve('makeOnline')(registry.constants.icon.blue) : registry.resolve('makeOnline')(registry.constants.icon.grey);
                  return ['Cruise Control', 'Location will be changed automatically when accessing a blocked resource.'];
              case 'manual':
                  isProxyOn() ? registry.resolve('makeOnline')(registry.constants.icon.blue) : registry.resolve('makeOnline')(registry.constants.icon.grey);
                  return ['Manual', 'Location is chosen by you.'];
              default:
                  return ['...', 'Not set yet'];
          }

      })();

      me.panel.port.emit('updateCurrentModeLabelsDone', titles);
    };

    me.panel.port.on('updateCurrentModeLabels', updateCurrentModeLabelsAndIcon);

    registry.onEvent('updateCurrentModeLabels', function(){
        var myLocation = getCurrentLocation();
        if(myLocation === false){
            return; // no case for that
        }
        updateCurrentModeLabelsAndIcon(myLocation);
    });


    var updateBlockingOptionsStatus = function () {
      var antitrackerState = true;
      var antisocialState = true;
      var easyState = true;
      if(storage.has('antitrackerPersistState') && storage.getJSON('antitrackerPersistState') !== true){
        antitrackerState = false;
      }
      if(storage.has('antisocialPersistState') && storage.getJSON('antisocialPersistState') !== true){
        antisocialState = false;
      }

      if(storage.has('easyPersistState') && storage.getJSON('easyPersistState') !== true){
        easyState = false;
      }
      panel.port.emit('update_blocking_options_status_done', {antitrackerState:antitrackerState, antisocialState: antisocialState, easyState:easyState});
    };

    panel.port.on('update_blocking_options_status', function () {
      updateBlockingOptionsStatus();
    });

    registry.onEvent('loadPrivacyOptionsDone', function () {
      updateBlockingOptionsStatus();
    });
  
  me.panel.port.on('restart_now', function () {
      let canceled = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
      Services.obs.notifyObservers(canceled, "quit-application-requested", "restart");
      if (canceled.data) return false; // somebody canceled our quit request

      // disable fastload cache?
      if (prefService.get("disable_fastload")) {
        Services.appinfo.invalidateCachesOnRestart();
      }

      // restart
      Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup)
        .quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);

      return true;
  });

  me.panel.port.on('might_return_to_main', function () {
    if(registry.has('restart_required')){
      switchSection('restart_required');
      registry.resolve('makeOnline')(registry.constants.icon.error);
    } else {
      switchSection('main');
    }
  });

  logger.log('object creation fineee');


  registry.onEvent('switch_section', function (section) {
    me.panel.port.emit('switch_section', section);
  });


};

Windscribe.prototype.logout = function(){
    var me = this;
    stopSessionUpdate();
    logger.log('action_user_logout event');
    turnOffProxy(me.panel, true);
    maybeDeleteCredentials().then(function () {
      registry.resolve('purgeStorageOnLogOut')();
      registry.emitEvent('logout');
      switchSection('login');
    });
};


module.exports = Windscribe;

