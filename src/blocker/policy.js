let Utils = require('./util.js').Utils;

const { Ci, Cu, Cc, Cr, components, Cm} = require('chrome');

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});


let {shouldAllowAsync, shouldAllow} = require('./desigioner.js');
var logger = new (require('./../misc/logger.js'))(['blocker']);
const { defer, all, resolve, race } = require('sdk/core/promise');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
var settings = require('./../settings.js');




var categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

/**
 * Actual nsIContentPolicy and nsIChannelEventSinkimplementation
 */
var policy =
{
  classDescription: "Windscribe content policy",
  classID: components.ID(settings.network_blocker_policy_CID), /* https://www.famkruithof.net/uuid/uuidgen */
  contractID: "@windscribe.com/blocker/policy;1",
  xpcom_categories: ["content-policy", "net-channel-event-sinks"],
  /**
   * Maps numerical content type IDs to strings.
   * @type Map.<number,string>
   */
  _types: new Map(),

  /**
   * Register class.
   */
  init: function()
  {
    try{
      logger.log('policy is loaded');
      // Populate types map
      let iface = Ci.nsIContentPolicy;
      for (let name in iface){
        if (name.indexOf("TYPE_") == 0 && name != "TYPE_DATAREQUEST"){
          this._types.set(iface[name], name.substr(5));
        }
      }



      for(let category of this.xpcom_categories){
        // this might be already loaded by older code and not unloaded, so far, unregister firts, if possible
        categoryManager.deleteCategoryEntry(category, this.contractID, false);
        categoryManager.addCategoryEntry(category, this.classDescription, this.contractID, false, true);
      }

      let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);

      if(registrar.isCIDRegistered(this.classID)){
        let /* nsJSCID */ targetNsJSCID = Cc[this.contractID];
        let service = targetNsJSCID.getService();
        // never ask
        service.QueryInterface(Ci.nsIContentPolicy);
        // ask
        service.QueryInterface(Ci.nsIFactory);
        // about magic here
        let component = service.QueryInterface(Ci.nsIChannelEventSink);
        registrar.unregisterFactory(this.classID, component);
        // now there should be 'unregister observer' but it is unable to unregister it after app was unloaded
      }

      registrar.registerFactory(this.classID, this.classDescription, this.contractID, this);

      // this is where it is falling now
      Services.obs.addObserver(this, "content-document-global-created", true);

      onShutdown((function() {
        try{
          Services.obs.removeObserver(this, "content-document-global-created");
        } catch (e){
          logger.error('Services.obs.removeObserver(this, "content-document-global-created");  problem:', e)
        }

        for (let category of this.xpcom_categories){
          try{
            categoryManager.deleteCategoryEntry(category, this.contractID, false);
          } catch (e){
            logger.error('categoryManager.deleteCategoryEntry("'+category+'", "'+this.contractID+'", false); ', e);
          }
        }
        logger.log('policy is unloaded(ciau)');
        try{
          registrar.unregisterFactory(this.classID, this);
        } catch (e){
          logger.error('registrar.unregisterFactory(this.classID, this);', e)
        }
        return Promise.resolve();
      }).bind(this));
    } catch (e){
      logger.error('problem with initiating policy', e);
    }
  },

  //
  // nsIContentPolicy interface implementation
  //

  shouldLoad: function(contentType, contentLocation, requestOrigin, node, mimeTypeGuess, extra)
  {

    try{
      let location =  Utils.unwrapURL(contentLocation);

      if(typeof location.spec != 'string'){
        let unwrapped = Utils.unwrapURL(location.spec);
        logger.log('typeof unwrapped:'+typeof unwrapped);
      }

      let doLog = location.spec.indexOf('wwwpromoter')>-1;
      if (doLog) {
        console.log('testing our case');
      }
//      logger.log('detect should allow on: '+location.spec);
      // Ignore requests without context and top-level documents
      if (!node || contentType == Ci.nsIContentPolicy.TYPE_DOCUMENT){
        if (doLog) console.log('!node || contentType == Ci.nsIContentPolicy.TYPE_DOCUMENT: accept');
        return Ci.nsIContentPolicy.ACCEPT;
      }
      // Bail out early for chrome: an resource: URLs, this is a work-around for
      // https://bugzil.la/1127744 and https://bugzil.la/1247640
      if (location.schemeIs("chrome") || location.schemeIs("resource"))
        return Ci.nsIContentPolicy.ACCEPT;

      // Ignore standalone objects
      if (contentType == Ci.nsIContentPolicy.TYPE_OBJECT && node.ownerDocument && !/^text\/|[+\/]xml$/.test(node.ownerDocument.contentType)){
        if (doLog) console.log('Ignore standalone objects: accept');
        return Ci.nsIContentPolicy.ACCEPT;
      }

      let wnd = Utils.getWindow(node);
      if (!wnd){
        if (doLog) console.log('!wnd: accept');
        return Ci.nsIContentPolicy.ACCEPT;
      }

      // Data loaded by plugins should be associated with the document
      if (contentType == Ci.nsIContentPolicy.TYPE_OBJECT_SUBREQUEST && node instanceof Ci.nsIDOMElement){
        node = node.ownerDocument;
      }


      // Fix type for objects misrepresented as frames or images
      if (contentType != Ci.nsIContentPolicy.TYPE_OBJECT && (node instanceof Ci.nsIDOMHTMLObjectElement || node instanceof Ci.nsIDOMHTMLEmbedElement)){
        contentType = Ci.nsIContentPolicy.TYPE_OBJECT;
      }



      let result = shouldAllow(wnd, node, this._types.get(contentType), location.spec);
      if(!result){
        logger.log('for: '+location.spec+', the result is : '+result);
      }

      if (console) logger.log('final result: '+result);
      return (result ? Ci.nsIContentPolicy.ACCEPT : Ci.nsIContentPolicy.REJECT_REQUEST);
    }  catch (e){
      logger.error('error in desigioner', e);
      if (doLog) console.log('(accept) error in desigioner'+e.message+'\n'+e.stack);
      return Ci.nsIContentPolicy.ACCEPT;
    }

  },

  shouldProcess: function(contentType, contentLocation, requestOrigin, insecNode, mimeType, extra)
  {
    return Ci.nsIContentPolicy.ACCEPT;
  },

  //
  // nsIObserver interface implementation
  //
  _openers: new WeakMap(),

  observe: function(subject, topic, data, uri)
  {
    switch (topic)
    {
      case "content-document-global-created":
      {
        let opener = this._openers.get(subject);
        if (opener && Cu.isDeadWrapper(opener))
          opener = null;

        if (!opener)
        {
          // We don't know the opener for this window yet, try to find it
          if (subject instanceof Ci.nsIDOMWindow)
            opener = subject.opener;

          if (!opener)
            return;

          // The opener might be an intermediate window, get the real one
          while (opener.location == "about:blank" && opener.opener)
            opener = opener.opener;

          this._openers.set(subject, opener);
        }

        if (!uri && subject instanceof Ci.nsIDOMWindow)
          uri = subject.location.href;
        if (!shouldAllow(opener, opener.document, "POPUP", uri))
        {
          subject.stop();
          Utils.runAsync(() => subject.close());
        }
        else if (uri == "about:blank")
        {
          // An about:blank pop-up most likely means that a load will be
          // initiated asynchronously. Wait for that.
          Utils.runAsync(() =>
          {
            let channel = subject.QueryInterface(Ci.nsIInterfaceRequestor)
              .getInterface(Ci.nsIDocShell)
              .QueryInterface(Ci.nsIDocumentLoader)
              .documentChannel;
            if (channel)
              this.observe(subject, topic, data, channel.URI.spec);
          });
        }
        break;
      }
    }
  },



  //
  // nsIFactory interface implementation
  //

  createInstance: function(outer, iid)
  {
    if (outer)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  },

  //
  // nsIChannelEventSink interface implementation
  //
  asyncOnChannelRedirect: function(oldChannel, newChannel, flags, callback)
  {
    let async = false;
    try
    {
      // nsILoadInfo.contentPolicyType was introduced in Gecko 35, then
      // renamed to nsILoadInfo.externalContentPolicyType in Gecko 44.
      let loadInfo = oldChannel.loadInfo;
      let contentType = ("externalContentPolicyType" in loadInfo ?
        loadInfo.externalContentPolicyType : loadInfo.contentPolicyType);
      if (!contentType)
        return;

      let wnd = Utils.getRequestWindow(newChannel);
      if (!wnd)
        return;

      if (contentType == Ci.nsIContentPolicy.TYPE_DOCUMENT)
      {
        if (wnd.history.length <= 1 && wnd.opener)
        {
          // Special treatment for pop-up windows - this will close the window
          // rather than preventing the redirect. Note that we might not have
          // seen the original channel yet because the redirect happened before
          // the async code in observe() had a chance to run.
          this.observe(wnd, "content-document-global-created", null, oldChannel.URI.spec);
          this.observe(wnd, "content-document-global-created", null, newChannel.URI.spec);
        }
        return;
      }

      shouldAllowAsync(wnd, wnd.document, this._.get(contentType), newChannel.URI.spec, function(allow)
      {
        callback.onRedirectVerifyCallback(allow ? Cr.NS_OK : Cr.NS_BINDING_ABORTED);
      });
      async = true;
    }
    catch (e)
    {
      // We shouldn't throw exceptions here - this will prevent the redirect.
      Cu.reportError(e);
    }
    finally
    {
      if (!async)
        callback.onRedirectVerifyCallback(Cr.NS_OK);
    }
  },

  // nsISupports interface implementation
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIContentPolicy,
    Ci.nsIFactory,
    Ci.nsIChannelEventSink,
    Ci.nsIObserver,
    Ci.nsISupportsWeakReference // have no idea about implementation, but without declaring it wont work
  ])
};


var shtdwnHndls = [];
function onShutdown(hndlr){
  if(shtdwnHndls.indexOf(hndlr)<0){
    shtdwnHndls.push(hndlr);
  }
}

var registerNetworkPolicy = function () {
  console.log('registerNetworkPolicy fine');
  try{
    policy.init();
  } catch (e){
    logger.error('policy registration fail', e);
  }
};

var unregisterNetworkPolicy = function () {
  console.log('unregisterNetworkPolicy fine');
  var allPromises = [];
  for(let i = 0; i<shtdwnHndls.length; i++){
    try{
      allPromises.push(shtdwnHndls[i]());
    } catch (e){ logger.error(e)}
  }
  all(allPromises).then(function () {
    return resolve();
  });
};


module.exports = {
  registerNetworkPolicy: registerNetworkPolicy,
  unregisterNetworkPolicy: unregisterNetworkPolicy,
  forceload: true // custom property for forcing it loader to debugger elier then main code will execute
};




