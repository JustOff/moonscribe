// windscribe
// jpm run -p tester -b "C:\Program Files (x86)\Nightly\firefox.exe"
// xpinstall.signatures.required
// extensions.logging.enabled
// extensions.sdk.console.logLevel = "all"



var debuggerConnectDelayedStart = 0; // use this
// var debuggerConnectDelayedStart = 30000; // this for debugger purposes only

let Logger = new require('./src/misc/logger.js');
Logger.setCategories([/* 'blocker', 'whitelist', 'main' , 'dom', 'uarotator', ''*/'']);
logger = new Logger(['main']);


var self = require("sdk/self");
var tabs = require('sdk/tabs');
var {purgeStorageOnUninstall} = require('./src/misc/purgeStorage.js');
var registry = require("./src/registry.js");
var {unregisterNetworkListener, registerNetworkListener} = require('./src/misc/networkListener.js');
var { checkSecureLink, reportMessage, getCurrentUrl, turnOffProxy, hasActiveSession, setDefaultPac} = require('./src/common_helpers.js');
var { setInterval, clearInterval, setTimeout } = require("sdk/timers");
const { components, CC, Cc, Ci, Cr, Cu } = require("chrome");
var pageMod = require("sdk/page-mod");
var { ToggleButton } = require('sdk/ui/button/toggle');
var panels = require("sdk/panel");
var events = require("sdk/system/events");
var Windscribe = require('./src/windscribe.js');
var SLinks     = require('./src/slinks.js');
var clipboard = require("sdk/clipboard");
var uselessVariableThatDoesWork = require('./src/blocker/policy').forceload;
var {doVersionCheck}          = require('./src/misc/versioner.js');
var { stopSessionUpdate } = require('./src/misc/sessionupdate.js');
var cm = require("sdk/context-menu");
var prefService = require("sdk/preferences/service");
var purgeStorage = require('./src/misc/purgeStorage.js');
require('./src/misc/loginDirect.js');
require('./src/misc/loginWithStoredCredentials.js');
var myplatform = require("./src/misc/platformResoler.js");
var storage = require('./src/storage.js');
const { sessionUpdateFunction } = require('./src/misc/sessionupdate');
var settings = require('./src/settings.js');
var isMac = (myplatform === 'Macintosh');
var width = isMac?355:354;
var height = isMac?392:390;


var doPreInit = function(loadReason){
  logger.log('loadReason:'+loadReason);
  if (loadReason==='install') {
    purgeStorageOnUninstall();
  }
  // no action for this: loadReason==='upgrade'
  prefService.set('extensions.sdk.logger.logLevel', 'all');
  prefService.set('extensions.'+self.id+'.sdk.console.logLevel', 'all');
  purgeStorage.init();
  doVersionCheck(loadReason);
  storage.reset('failedUpdateSessionCounter');
  storage.reset('locations_revision_number');
};


var initUI = function () {
  pageMod.PageMod({
    include: "*",
    contentScriptFile: "./uacontentscript.js"
  });

 // todo: add debugger
  var button = ToggleButton({
    id: "windscribe",
    aId: "windscribe",
    label: "Windscribe",
    icon: {
      "16": "./icons/16x16_off.png",
      "32": "./icons/48x48_off.png",
      "64": "./icons/128x128_on.png"
    },
    onChange: handleChange
  });

  /*
   It is possible change 'contentURL' for existing panel, but there is no
   way to do this with 'contentScriptFile' and 'contentStyleFile' properties.
   First idea was reinit panel entirely.
   But during reinit the panel is blinking. Blinking panel looks awful.
   Another way of doing this will be put evrything into one file with
   sections and play with "display: none" for hidden sections,
   thats solution is implemented here.
   */
  var panel = panels.Panel({
    contentURL: self.data.url("panel.html"),
    contentScriptFile: [
      self.data.url("panel-script.js"),
      self.data.url('libs/common_functions.js'),
      self.data.url('libs/CSSClass.js'),
      self.data.url('libs/jss.js'),
      self.data.url('libs/perfect-scrollbar/perfect-scrollbar.js'),
      self.data.url('libs/jsonToDOM.js')
    ],
    contentStyleFile: [
      self.data.url("panel-style.css"),
      self.data.url('libs/perfect-scrollbar/perfect-scrollbar.css')
    ],
    onHide: handleHide
  });

  function handleHide() {
    button.state('window', {checked: false});
  }

  function handleChange(state) {
    if (state.checked) {
      panel.show({
        position: button,
        width: width,
        height: height
      });

      panel.on('show', function(){
        panel.port.emit('update_ui');
        // bypass login
        // windscribe.signIn({name: 'name', passw: 'passw'});
      })
    } else {
      panel.port.emit('update_ui');
    }
  }

  panel.on('show', function() {
    storage.has('session_auth_hash') && sessionUpdateFunction();
  });


  registry.register('makeOnline', function(icon){
    switch (icon){
      case registry.constants.icon.blue:
        button.icon = {
          "16": "./icons/16x16_on.png",
          "32": "./icons/48x48_on.png",
          "64": "./icons/128x128_on.png"
        };
        break;
      case registry.constants.icon.grey:
        button.icon = {
          "16": "./icons/16x16_off.png",
          "32": "./icons/48x48_off.png",
          "64": "./icons/128x128_off.png"
        };
        break;
      case registry.constants.icon.doubleHop:
        button.icon = {
          "16": "./icons/38x38_on_doublehop.png",
          "32": "./icons/48x48_on_doublehop.png",
          "64": "./icons/128x128_on_doublehop.png"
        };
        break;
      case registry.constants.icon.error:
        button.icon = {
          "16": "./icons/128x128_off.png",
          "32": "./icons/128x128_off.png",
          "64": "./icons/128x128_off.png"
        };
        break;
    }
  });

  return {panel, button};
};


var initContextMenu = function (panel, button, slinks) {
// it is possible remove context menu item depending on conditions
// but there is no way to change data arguments of state of the script
// so recreate sounds good alternative
// still not needed yet
  var cmItem = cm.Item({
    label: "Copy Secure.link",
    //context: cm.SelectorContext("a[href]"),
    //context: cm.URLContext(new MatchPattern("http://*")),
    contentScriptFile: self.data.url("contextmenu.js"),
    image: self.data.url("icons/16x16_on.png"),
    onMessage: function () {
      if(hasActiveSession() && !(registry.has('restart_required'))){
        var url = getCurrentUrl();
        slinks.create(url, function(data){
          if(data.success){
            // important: first dom-tree ready, than this handler execute
            // have no idea why, but this works this way
            clipboard.set(data.data.secure_url);
            panel.port.emit('slinks_ready', data.data);
            panel.show({
              position: button,
              width: width,
              height: height
            });
          } else {
            reportMessage('Invalid page URL');
          }
        });
      }
    }
  });

};


var initModules = function (panel, loadReason) {
  // these modules depends on 'panel'
  registry.register('panel', panel);

  try{ require('./src/misc/uarotator.js').init(); } catch (e){ logger.error('error during init of src/misc/uarotator.js', e); }

  try{ require('./src/blocker/index.js').init(); } catch (e){ logger.error('error during init of /src/blocker/popupFooter.js', e); }

  try{ require('./src/misc/firstRun.js').init(); } catch (e){ logger.error('error during init of /src/misc/firstRun.js', e); }

  try{ require('./src/misc/checkMode.js').init(); } catch (e){ logger.error('error during init of /src/misc/checkMode.js', e); }

  try{ require('./src/misc/siteRegistration.js').init(loadReason); } catch (e){ logger.error('error during init of /src/misc/siteRegistration.js', e); }


  var windscribe = new Windscribe(panel);
  var slinks = new SLinks();
  slinks.bindListeners(panel);

  // setInterval(function () {
  //   panel.port.emit('main_traffic_ends');
  // }, 35000);


  registerNetworkListener();
  return {windscribe, slinks};
};

exports.main = function({ loadReason }) {
  if(uselessVariableThatDoesWork == uselessVariableThatDoesWork){
    // then variable has equal value to itself value
  }
  setTimeout(function () {
    doPreInit(loadReason);

    var {panel, button} = initUI();

    // log messages from HTML UI thread
    panel.port.on('log', function(mess){ console.log(mess); });
    let {slinks} = initModules(panel, loadReason);
    initContextMenu(panel, button, slinks);

    // switcher val is false initially
    registry.register('proxy_state_remember', 'Off');

    registry.emitEvent('switchToDefaultScreen');
    registry.emitEvent('checkActiveSessions');
  }, debuggerConnectDelayedStart);
};

exports.onUnload = function (reason) {
    logger.log('shoutdown, reasone:'+reason);

    if(reason == "uninstall"){
      purgeStorageOnUninstall();
    }
    stopSessionUpdate();

    if (reason === "shutdown") {
      setDefaultPac()
    } else {
      try{
        var panel = registry.resolve('panel');
        turnOffProxy(panel);
      } catch (e){ console.log('turningOffProxy error ', e)}
    }
    unregisterNetworkListener();

    if (reason == "uninstall") {
      tabs.open(settings.EXTERNAL_URL_OPEN_ON_UNINSTALL);
    }

    registry.emitEvent('shutdown');
};