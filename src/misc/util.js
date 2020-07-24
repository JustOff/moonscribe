const { components, CC, Cc, Ci, Cr, Cu } = require("chrome");

var logger = new (require('./logger.js'))(['blocker']);


Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
let {PrivateBrowsingUtils} = Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm", {});

//noinspection AssignmentResultUsedJS
let Utils = {

  runAsync: function(callback)
  {
    Services.tm.currentThread.dispatch(callback, Ci.nsIEventTarget.DISPATCH_NORMAL);
  },
  
  /**
   * Gets the DOM window associated with a particular request (if any).
   */
  getRequestWindow: function(/**nsIChannel*/ channel) /**nsIDOMWindow*/
  {
    try
    {
      if (channel.notificationCallbacks)
        return channel.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}

    try
    {
      if (channel.loadGroup && channel.loadGroup.notificationCallbacks)
        return channel.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    } catch(e) {}

    return null;
  },

  /**
   * Retrieves the window for a document node.
   * @return {Window} will be null if the node isn't associated with a window
   */
  getWindow: function(/**Node*/ node)
  {
    if ("ownerDocument" in node && node.ownerDocument)
      node = node.ownerDocument;

    if ("defaultView" in node)
      return node.defaultView;

    return null;
  },

  /**
   * If a protocol using nested URIs like jar: is used - retrieves innermost
   * nested URI.
   */
  unwrapURL: function(/**nsIURI or String*/ url) {
    if (!(url instanceof Ci.nsIURI)){
      url = Utils.makeURI(url);
    }

    if (url instanceof Ci.nsINestedURI)
      return url.innermostURI;
    else
      return url;
  },

  /**
   * Translates a string URI into its nsIURI representation, will return null for
   * invalid URIs.
   */
  makeURI: function(/**String*/ url) /**nsIURI*/
  {
    try
    {
      return Utils.ioService.newURI(url, null, null);
    }
    catch (e) {
      return null;
    }
  },




  /**
   * Retrieves the effective location of a window.
   */
  getWindowLocation: function(/**Window*/ window) /**String*/
  {
    let result = null;

    // Crazy Thunderbird stuff
    if ("name" in window && window.name == "messagepane")
    {
      try
      {
        let mailWnd = window.QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIWebNavigation)
          .QueryInterface(Ci.nsIDocShellTreeItem)
          .rootTreeItem
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindow);

        // Typically we get a wrapped mail window here, need to unwrap
        try
        {
          mailWnd = mailWnd.wrappedJSObject;
        } catch(e) {}

        if ("currentHeaderData" in mailWnd && "content-base" in mailWnd.currentHeaderData)
        {
          result = mailWnd.currentHeaderData["content-base"].headerValue;
        }
        else if ("currentHeaderData" in mailWnd && "from" in mailWnd.currentHeaderData)
        {
          let emailAddress = Utils.headerParser.extractHeaderAddressMailboxes(mailWnd.currentHeaderData.from.headerValue);
          if (emailAddress)
            result = 'mailto:' + emailAddress.replace(/^[\s"]+/, "").replace(/[\s"]+$/, "").replace(/\s/g, '%20');
        }
      } catch(e) {}
    }

    // Sane branch
    if (!result)
      result = window.location.href;

    // Remove the anchor if any
    let index = result.indexOf("#");
    if (index >= 0)
      result = result.substring(0, index);

    return result;
  },

  /**
   * Retrieves the frame hierarchy for a window. Returns an array containing
   * the information for all frames, starting with the window itself up to its
   * top-level window. Each entry has a location and a sitekey entry.
   * @return {Array}
   */
  getFrames: function(/**Window*/ window)
  {
    let frames = [];
    while (window)
    {
      let frame = {
        location: Utils.getWindowLocation(window),
        sitekey: null
      };

      let documentElement = window.document && window.document.documentElement;
      if (documentElement)
        frame.sitekey = documentElement.getAttribute("data-adblockkey")

      frames.push(frame);
      window = (window != window.parent ? window.parent : null);
    }

    // URLs like about:blank inherit their security context from upper-level
    // frames, resolve their URLs accordingly.
    for (let i = frames.length - 2; i >= 0; i--)
    {
      let frame = frames[i];
      if (frame.location == "about:blank" || frame.location == "moz-safe-about:blank" ||
        Utils.netUtils.URIChainHasFlags(Utils.makeURI(frame.location), Ci.nsIProtocolHandler.URI_INHERITS_SECURITY_CONTEXT))
      {
        frame.location = frames[i + 1].location;
      }
    }

    return frames;
  },
  /**
   * Checks whether Private Browsing mode is enabled for a content window.
   * @return {Boolean}
   */
  isPrivate : function(/**Window*/ window)
  {
    return PrivateBrowsingUtils.isContentWindowPrivate(window);
  },

  /**
   * Returns version of the Gecko platform
   */
  get platformVersion()
  {
    let platformVersion = Services.appinfo.platformVersion;
    Object.defineProperty(this, "platformVersion", {value: platformVersion});
    return platformVersion;
  },

};

XPCOMUtils.defineLazyServiceGetter(Utils, "ioService", "@mozilla.org/network/io-service;1", "nsIIOService");
XPCOMUtils.defineLazyServiceGetter(Utils, "httpProtocol", "@mozilla.org/network/protocol;1?name=http", "nsIHttpProtocolHandler");
XPCOMUtils.defineLazyServiceGetter(Utils, "effectiveTLD", "@mozilla.org/network/effective-tld-service;1", "nsIEffectiveTLDService");
XPCOMUtils.defineLazyServiceGetter(Utils, "netUtils", "@mozilla.org/network/util;1", "nsINetUtil");
XPCOMUtils.defineLazyServiceGetter(Utils, "styleService", "@mozilla.org/content/style-sheet-service;1", "nsIStyleSheetService");
XPCOMUtils.defineLazyServiceGetter(Utils, "systemPrincipal", "@mozilla.org/systemprincipal;1", "nsIPrincipal");

/**
 * Extracts the hostname from a URL (might return null).
 */
Utils.getHostname = function (url) {
  try
  {
    return Utils.unwrapURL(url).host;
  }
  catch(e)
  {
    return null;
  }
};

/**
 * E10S compatibility shims will reroute property retrieval on some objects
 * in order to enable custom behavior. This cannot be disabled on case by case
 * basis (see https://bugzilla.mozilla.org/show_bug.cgi?id=1167802). So
 * instead we use a different execution context to retrieve properties when
 * E10S compatibility shims shouldn't kick in. This method simply returns
 * obj[prop] but without any custom behavior.
 */
/**
 *  upd: in latest ABP implementation it was removed in order to get worked with multiprocess firefox
 *  btw: multiprocess firefox is not supported in this version
 */
Utils.getPropertyWithoutCompatShims = function(/**Object*/ obj, /**String*/ prop) {
  let sandbox = Cu.Sandbox(Utils.systemPrincipal);
  sandbox.obj = obj;
  sandbox.prop = prop;
  return Cu.evalInSandbox("obj[prop]", sandbox);
};




exports.Utils = Utils;