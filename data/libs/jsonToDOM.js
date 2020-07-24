function jsonToDOM(json, doc, nodes) {

  var namespaces = {
    html: 'http://www.w3.org/1999/xhtml',
    xul: 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul'
  };
  var defaultNamespace = namespaces.html;

  function namespace(name) {
    var m = /^(?:(.*):)?(.*)$/.exec(name);
    return [namespaces[m[1]], m[2]];
  }

  function tag(name, attr) {
    if (Array.isArray(name)) {
      var frag = doc.createDocumentFragment();
      Array.prototype.forEach.call(arguments, function (arg) {
        if (!Array.isArray(arg[0]))
          frag.appendChild(tag.apply(null, arg));
        else
          arg.forEach(function (arg) {
            frag.appendChild(tag.apply(null, arg));
          });
      });
      return frag;
    }

    var args = Array.prototype.slice.call(arguments, 2);
    if(name){
      var vals = namespace(name);
      var elem = doc.createElementNS(vals[0] || defaultNamespace, vals[1]);

      for (var key in attr) {
        var val = attr[key];
        if (nodes && key == 'key')
          nodes[val] = elem;

        vals = namespace(key);
        if (typeof val == 'function')
          elem.addEventListener(key.replace(/^on/, ''), val, false);
        else
          elem.setAttributeNS(vals[0] || '', vals[1], val);
      }
      args.forEach(function(e) {
        try {
          elem.appendChild(
            Object.prototype.toString.call(e) == '[object Array]'
              ?
              tag.apply(null, e)
              :
              e instanceof doc.defaultView.Node
                ?
                e
                :
                doc.createTextNode(e)
          );
        } catch (ex) {
          elem.appendChild(doc.createTextNode(ex));
        }
      });
    } else {
      // modification for allowing plain text nodes as only child (ex: "text <tag>textintag</tag> anothertext")
      var frag = doc.createDocumentFragment();
      args.forEach(function(e) {
        frag.appendChild(doc.createTextNode(e))
      });
      return frag;
    }

    return elem;
  }
  return tag.apply(null, json);
}