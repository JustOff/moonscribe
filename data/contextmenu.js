self.on("click", function (node, data) {
	self.postMessage('');
});

self.on("context", function(node){
	var url = document.location.href;
	if(url && url.match(/^(http|https|mailbox|imap|news|snews)\:\/\//i)) return true; //show in context menu if return value is true.
});