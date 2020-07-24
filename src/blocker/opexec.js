/**
 * o(rdered) p(romise) exec(utor)
 */

var queue = [];

var bindThenCallback = function (promise) {
  promise.then(function () {
    if(queue.length == 1){ // nothing else
      queue = [];// delete this
    } else {
      queue = [queue[1]()];
      bindThenCallback(queue[0]);
    }
  });
};

module.exports = function (/* should return promises */clbcs) {
  if(queue.length == 0){
    var firstPromise = clbcs();
    queue.push(firstPromise);
    bindThenCallback(firstPromise);
  } else {
    queue[1] = clbcs;// function but not it's call
  }
};