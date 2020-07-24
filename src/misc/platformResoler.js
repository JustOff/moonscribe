var rawPlatform = require('sdk/window/utils').getMostRecentBrowserWindow().navigator.platform;
var getPlatform = function (el) {
    // http://stackoverflow.com/q/19877924/449553
    if(el.indexOf('Linux')>-1){
        return 'Linux';
    }

    switch (el){
        case 'Win16':
        case 'Win32':
        case 'Win64':
        case 'WinCE':
            return 'Windows';
        case 'Mac68K':
        case 'MacPPC':
        case 'MacIntel':
        case 'Macintosh':
            return 'Macintosh';
        default: return el;
    }
};
var detectedPlatform = getPlatform(rawPlatform);
module.exports = detectedPlatform;