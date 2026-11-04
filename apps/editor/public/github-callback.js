// GitHub sends the user back here with a one-time code. Pass it to the Klinth
// tab that asked (same origin only), remove it from the address bar, and close.
(function () {
  var params = new URLSearchParams(window.location.search);
  history.replaceState(null, '', window.location.pathname);
  var message = {
    type: 'klinth-github',
    state: params.get('state'),
    code: params.get('code'),
    error: params.get('error'),
  };
  try {
    var channel = new BroadcastChannel('klinth-github');
    channel.postMessage(message);
    channel.close();
  } catch {
    // Very old browser: nothing to do but show the message below.
  }
  document.getElementById('status').textContent = message.code
    ? 'Connected. You can close this window and go back to Klinth.'
    : 'GitHub did not connect. Close this window and try again in Klinth.';
  setTimeout(function () {
    window.close();
  }, 150);
})();
