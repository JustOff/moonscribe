var registry = require('./../registry.js');
var data = require("sdk/self").data;
var pageMod = require("sdk/page-mod");
var settings = require('./../settings.js');
var storage = require('./../storage.js');
var tabs = require('sdk/tabs');

var mod;

var contentScript = [
    'var cookieEl = document.getElementById("ws_ext_auth");',
    'if(cookieEl){',
        'var cookie = cookieEl.value;',
        'self.port.emit("accept_cookie", cookie);',
    '}'
].join('\n');

var init = function (loadReason) {
    mod = pageMod.PageMod({
        include: settings.EXTERNAL_LOGIN_LOCATION_REGEXP,
        contentScript: contentScript,
        onAttach: function (worker) {
            worker.port.on('accept_cookie', function(cookie) {
                if(!storage.has('session_auth_hash')){
                    storage.set('session_auth_hash', cookie);
                    registry.emitEvent('loginWithStoredCredentials', true);
                }
            });
        }
    });

    registry.onEvent('shutdown', function () {
        if(mod){
            mod.destroy();
            mod = null;
        }
    });

    if(loadReason === 'install' ){
        tabs.open(settings.EXTERNAL_LOGIN_URL_OPEN_ON_INSTALL);
    }
};

exports.init = init;