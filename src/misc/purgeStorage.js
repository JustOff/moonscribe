var storage = require('./../storage.js');
var preferences = require("sdk/preferences/service");
var registry = require('./../registry.js');

var purgeStorageOnLogOut = function(){
  preferences.reset('network.proxy.type');
  preferences.reset('network.proxy.autoconfig_url');
  storage.reset('authCookie');
  storage.reset('session_auth_hash');
  storage.reset('proxy_state_must');
  storage.reset('PAC');
  storage.reset('originalPAC');
  storage.reset('current_country');
  storage.reset('username');
  storage.reset('user_id');
  storage.reset('traffic_used');
  storage.reset('traffic_max');
  storage.reset('email_status');
  storage.reset('session_type_id');
  storage.reset('billing_plan_id');
  storage.reset('status');
  storage.reset('was_premium');
  // storage.reset('ext_username');
  storage.reset('userAgentRotatorState');
  storage.reset('lastLoadTimeOfUAList');
  storage.reset('whitelist');
  storage.reset('proxyStateBeforeExpiration');
  storage.reset('relogin_required');
  storage.reset('locations_revision_number');
  storage.reset('WS_GRP');
  storage.reset('proxy_state_original');
  storage.reset('proxy_autoconfig_url_original');
  storage.reset('doubleHopSetByUser');
  storage.reset('ourLocationCode');
  storage.reset('proxyBeforeOurLocation');
  storage.reset('extensionMode');
};

var purgeStorageOnUninstall = function () {
  purgeStorageOnLogOut();
  storage.reset('location_cache');
  storage.reset('cachedUAList'); // todo: fix tihs
  storage.reset('version');
  storage.reset('ext_username');
  storage.reset('api_endpoint');
};

exports.purgeStorageOnLogOut = purgeStorageOnLogOut;
exports.purgeStorageOnUninstall = purgeStorageOnUninstall;
exports.init = function () {
  registry.register('purgeStorageOnLogOut', purgeStorageOnLogOut);
};
