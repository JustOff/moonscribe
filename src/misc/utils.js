var md5 = require('../md5.js').md5;
var storage = require('../storage.js');
var registry = require("../registry.js");
var settings = require('../settings.js');
var logger = new (require('./logger.js'))(['main']);
var Whitelist = require('./whitelist.js');
var OLD_PAC;

try{

    var getWithBasicSigning = function (ops) {
        var time = "" + (new Date() - 0);
        var client_auth_hash = md5(settings.SHARED_SECRET + time);
        return Object.assign({
            time: time,
            client_auth_hash: client_auth_hash
        }, ops);
    };

    var getWithSessionedSigning = function(ops){
        //todo: ???
        if(!ops) return;
        var basicParams = getWithBasicSigning(ops);
        //todo: ???
        if(!storage.has('session_auth_hash')){
            logger.log("Authorization is broken. " +
                "session_auth_hash is not stored. " +
                "Please relogin.");
        }
        basicParams.session_auth_hash = storage.get('session_auth_hash');
        return basicParams;
    };

} catch(e){
    logger.error('ERROR:'+e);
}

try{
    var getEndpoint = function(service){
        return settings.ENDPOINT+service;
    };
} catch(e){
    logger.error('ERROR:'+e);
}

var isNoInternetErrorCode = function (response) {
    return (response.status === 0);
};

var validResponceWithCredentials = function (response) {
    if(!('json' in response)){
        return false;
    }
    var res = response.json;
    if(('username' in res.data) && ('password' in res.data)){
        // other false values:
        if(!res.data.username){
            return false;
        }
        if(!res.data.password){
            return false;
        }
        // blank string
        if(((''+res.data.username).trim().length == 0 ) || ((''+res.data.password).trim().length == 0 )){
            return false;
        } else {
            return true;
        }
    } else {
        return false;
    }
};

try{
    var refillPACWhitelist = function (PAC) {
        var listForPAC = Whitelist.getList().map(function (el) {
            return ['*.'+el.url+'/*', '*//'+el.url+'/*'];
        }).reduce(function (collect, current) {
            collect.push(current[0]);
            collect.push(current[1]);
            return collect;
        }, []);
        PAC = PAC.replace(/(.*whitelist = )(.*?)(;.*)/mg, '$1' + JSON.stringify(listForPAC) + '$3');
        PAC = PAC.replace(/(.*)(shExpMatch\(url, whitelist\[i\]\).*)/mg,
            '$1' + 'url != "' + settings.CHECK_IPV4_URL + '" && url != "' + settings.CHECK_NOSSL_URL + '" && $2');
        return PAC;
    };
} catch (e){
    logger.error('ERROR:'+e);
}

try{

    var changeLocation = function(code, name, country_code){
        // available for sure - initiated during login
        var PAC = storage.getJSON('originalPAC');
        PAC = refillPACWhitelist(PAC);
        if(code == 'Automatic'){
            // assuming in default pac file there will be already cruise control
            storage.setJSON('current_country', {code: 'Automatic', name: 'Automatic'});
        } else {
            // code = code.substring(0, 2);
            PAC = PAC.replace(/(.*chosenLocation = )(.*?)(;.*)/mg, '$1\''+code+'\'$3');
            PAC = PAC.replace(/(.*controlMode = )(.*?)(;.*)/mg, '$1\'\'$3');
            storage.setJSON('current_country', {code: code, name: name, country_code: country_code});
        }

        if (PAC != OLD_PAC) {
          console.log('Proxy config updated, location:', storage.getJSON('current_country').name);
          OLD_PAC = PAC;
        }
        storage.setJSON('PAC', PAC);
    };

} catch (e){
    logger.error('ERROR:'+e);
}

try {
    var setOurLocationAsCurrent = function() {
        var ourLocationCode = storage.get('ourLocationCode');

        if (ourLocationCode && storage.has('location_cache') && !storage.get('doubleHopSetByUser') ) {
            var panel = registry.resolve('panel')
            var locations = storage.getJSON('location_cache') || [];
            var ourLocation = locations.filter(function(loc) {
                return loc.short_name === ourLocationCode;
            })
            console.log('ourLocation', ourLocation)
            // changeLocation(ourLocation[0].short_name, ourLocation[0].name, ourLocation[0].country_code);
            storage.setJSON('current_country', {code: ourLocation[0].short_name, name: ourLocation[0].name, country_code: ourLocation[0].country_code});
            panel.port.emit('locations_update_current_ui_done', {code: ourLocation[0].short_name, name: ourLocation[0].name, country_code: ourLocation[0].country_code});
        }
    }
} catch (e) {
    logger.error('ERROR:'+e);
}

module.exports = {
    getWithBasicSigning: getWithBasicSigning,
    getWithSessionedSigning: getWithSessionedSigning,
    getEndpoint: getEndpoint,
    isNoInternetErrorCode: isNoInternetErrorCode,
    validResponceWithCredentials: validResponceWithCredentials,
    changeLocation: changeLocation,
    setOurLocationAsCurrent: setOurLocationAsCurrent
};
