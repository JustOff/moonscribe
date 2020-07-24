
var registry = require('./../registry.js');
var storage = require('./../storage.js');
var {isProxied, isExtraSecond} = require('./../common_helpers.js');
var logger = new (require('./logger.js'))(['main']);
let Utils = require('./../blocker/util.js').Utils;

// native api start here
// https://github.com/canuckistani/jp-block-site-example
// 'events.on' also are not able to modify header, another firefox bug?
const { Ci, Cu, Cc, Cr } = require('chrome');
Cu.import('resource://gre/modules/Services.jsm');

var {isUARotatorOn, getUA} = require('./uarotator.js');
var {maybeAddCustomHeader} = require('./ownsiteheader.js');

var isProxyOn = function () {
  if(!registry.has('proxy_state_remember')){
    return false;
  }
  let rememberedState = registry.resolve('proxy_state_remember');
  return rememberedState === 'On'
};

var networkObserver = {
  observe: function (subject, topic, aData) {
    try {
      if (topic == 'http-on-modify-request') {

        var channel = subject.QueryInterface(Ci.nsIHttpChannel);
        // var requestUrl = channel.URI.spec;

        var locationForUA;
        var domWin = Utils.getRequestWindow(subject.QueryInterface(Ci.nsIChannel));
        if(domWin){
          if(domWin.top){
            locationForUA = domWin.top.location.href;
          } else {
            locationForUA = domWin.location.href;
          }

          if(isUARotatorOn(locationForUA)){
            var ua = getUA();
            channel.setRequestHeader('User-Agent', ua.trim(), false);
            delete ua;
          }
        }

        maybeAddCustomHeader(channel);

        if(!isProxyOn()){
          return;
        }

        var proxyChannel = subject.QueryInterface(Ci.nsIProxiedChannel);

        if( !proxyChannel || !proxyChannel.proxyInfo || !proxyChannel.proxyInfo.host ) return;
        if( proxyChannel.proxyInfo.host.indexOf("whiskergalaxy.com") === -1 ) return;

        // todo: add checking servers origin from pac-file
        if (isProxied() || isExtraSecond()) {
          if (storage.has('authCookie')) {
            var authCookie = storage.get('authCookie');
            channel.setRequestHeader('Proxy-Authorization', 'Basic ' + authCookie, false);
            authCookie = null;
          }

          if (storage.has('WS_GRP')) {
            var wsGrpNumber = storage.get('WS_GRP');
            var wsGrpValue = wsGrpNumber < 10 ? '0' + wsGrpNumber.toString() : wsGrpNumber.toString();
            channel.setRequestHeader('WS-GRP', wsGrpValue, false);

            wsGrpNumber = null;
            wsGrpValue = null;
          }
        }

        channel = null;
        proxyChannel = null;

      } else if (topic == 'http-on-examine-response') {

        if(!isProxyOn()){
          return;
        }


        // ok, this is design issue - response code cannot be changed
        // it is logically that if you're using extension for proxy and you'r got
        // a proxy auth wind;ow, than something goes wrong
        // workaround will - need to modify response and replace 407 code with 200, and
        // in that case auth window will be not appear and we can normally show error message, or even write it to response body
        // but due to design issue that solution is impossible

        var httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
        if (httpChannel.responseStatus == 407 /* proxy auth required */) {
          // how to live without credentials in proper way
          storage.set('relogin_required', true);
          registry.emitEvent('reloginRequired');// <--- this is async
        }
      }

    } catch (e) {
      logger.error('error in listener:'+ e.message);
    }
  }
};

var registerNetworkListener = function () {
  try{
  Services.obs.addObserver(networkObserver, 'http-on-modify-request', false);
  } catch (e){}
  try{
  Services.obs.addObserver(networkObserver, 'http-on-examine-response', false);
  } catch (e){}
};

var unregisterNetworkListener = function () {
  try{
    Services.obs.removeObserver(networkObserver, "http-on-modify-request");
  } catch (e){}
  try {
    Services.obs.removeObserver(networkObserver, "http-on-examine-response");
  } catch (e){}
};


exports.registerNetworkListener = registerNetworkListener;
exports.unregisterNetworkListener = unregisterNetworkListener;
exports.isProxyOn = isProxyOn;
