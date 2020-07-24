var logger = new (require('./logger.js'))(['main']);
var Utils = require('./util.js').Utils;
var storage = require('./../storage.js');
var {reapplySameLocation} = require('./../common_helpers.js');
var settings = require('../settings.js');


var refreshPackFile = function () {
  // workaround of loader problem
  if(!reapplySameLocation){
    var rsl = require('./../common_helpers.js').reapplySameLocation;
    reapplySameLocation = rsl;
  }
  reapplySameLocation()
};

var maybeInit = function () {
  if (!storage.has('whitelist')) {
    storage.setJSON('whitelist', settings.whitelistDefault);
  }
};


var Whitelist = {};

Whitelist.getBaseDomain = function (site) {
  if (site.indexOf('://') === -1) {
    return site;
  }
  let uri = Utils.makeURI(site);
  if(uri == null){
    uri = site;
  }
  var unwrapped = Utils.unwrapURL(uri);
  if(unwrapped != null){
    let host = Utils.unwrapURL(uri).host;
    return Utils.effectiveTLD.getBaseDomainFromHost(host);
  } else {
    return Utils.effectiveTLD.getBaseDomainFromHost(site);
  }
};

Whitelist.isWhitelisted = function (url, adsOnly = true) {
  maybeInit();

  var list = storage.getJSON('whitelist');

  try {
    var baseDomain = Whitelist.getBaseDomain(url);
  } catch (e) {
    logger.log('error in getting isWhitelisted', e);
    return false;
  }

  var itemIndex = list.findIndex(function (el) {
    if (adsOnly) {
      var one = (el.url == baseDomain && ((typeof el.adsOnly === 'undefined') || (el.adsOnly === true)));
      // console.log('el.url == baseDomain:'+(el.url == baseDomain)+", typeof el.adsOnly === 'undefined'):"+(typeof el.adsOnly === 'undefined')+', el.adsOnly === true:'+(el.adsOnly === true));
      return one;
    } else {
      return el.url == baseDomain;
    }
  });
  var res = itemIndex > -1;
  // console.log('itemIndex: '+itemIndex+', list:'+ JSON.stringify(list)+', isWhitelisted:'+res);
  return  res;
};

Whitelist.addSite = function (site, adsOnly = true) {
  maybeInit();
  var baseDomain;
  try {
    baseDomain = Whitelist.getBaseDomain(site);
  } catch (e) {
    return false;
  }
  Whitelist.removeSite(baseDomain);
  var list = storage.getJSON('whitelist');
  var item = {url: baseDomain, adsOnly: adsOnly};
  list.push(item);
  storage.setJSON('whitelist', list);

  // work with PAC
  if(!adsOnly){
    refreshPackFile();
  }
};

Whitelist.removeSite = function (site) {
  maybeInit();
  var baseDomain;
  try {
    baseDomain = Whitelist.getBaseDomain(site);
  } catch (e) {
    return false;
  }
  var list = storage.getJSON('whitelist');

  var index = list.findIndex(function (el) {
    return el.url == baseDomain;
  });

  if (index > -1) {
    list.splice(index, 1);
    storage.setJSON('whitelist', list);
    refreshPackFile();
  }

};

Whitelist.getList = function () {
  maybeInit();
  var list = storage.getJSON('whitelist');
  // console.log('list:'+JSON.stringify(list));
  return list;
};

module.exports = Whitelist;