var tessel = require('tessel');
var kommand = require('kommand').instance;
var gpio = tessel.port['GPIO'];

/* the wifi-cc3000 library is bundled in with Tessel's firmware,
 * so there's no need for an npm install. It's similar
 * to how require('tessel') works.
 */
var config = require('./config.js');
var wifi = require('wifi-cc3000');
var network = config.wifi_network; // put in your network name here
var pass = config.wifi_password; // put in your password here, or leave blank for unsecured
var security = 'wpa2'; // other options are 'wep', 'wpa', or 'unsecured'
var timer;

var started = false;
var timeouts = 0;

// reset the wifi chip progammatically
function powerCycle(){
  // when the wifi chip resets, it will automatically try to reconnect
  // to the last saved network
  wifi.reset(function(){
    timeouts = 0; // reset timeouts
    console.log("done power cycling");
    // give it some time to auto reconnect
    setTimeout(function(){
      if (!wifi.isConnected()) {
        // try to reconnect
        connectWifi();
      }
      }, 20 * 1000); // 20 second wait
  })
}


// connect to the wifi network
// check if the wifi chip is busy (currently trying to connect), if not, try to connect
function tryConnectWifi() {
	if (!wifi.isBusy()) {
		connectWifi();
	} else {
		// The cc3k is set up to automatically try to connect on boot. 
		// For the first few seconds of program bootup, you'll always 
		// see the wifi chip as being "busy"
		console.log("is busy, trying again");
		setTimeout(function() {
			tryConnectWifi();
		}, 1 * 1000);
	}
}

function connectWifi() {
	wifi.connect({
		security: security,
		ssid: network,
		password: pass,
		timeout: 30 // in seconds
	});
}

function registerWifiEvent() {
	wifi.on('connect', function(err, data) {
		// you're connected 
		if(timer)
			timer.clearInterval();
		if (!started)
			startKommander();
		console.log("wifi connect emitted", err, data);
	});

	wifi.on('disconnect', function(err, data) {
		// wifi dropped, probably want to call connect() again		
		console.log("wifi disconnect emitted", err, data);
		timer=setInterval(function(){
			connectWifi();
		},10 * 1000);
	});
	
	wifi.on('timeout', function(err){
		// tried to connect but couldn't, retry
		console.log("wifi timeout emitted");
		timeouts++;
		if (timeouts > 2) {
			// reset the wifi chip if we've timed out too many times
			powerCycle();
		} else {
			// try to reconnect
			connectWifi();
		}
	});

	wifi.on('error', function(err) {
		// one of the following happened
		// 1. tried to disconnect while not connected
		// 2. tried to disconnect while in the middle of trying to connect
		// 3. tried to initialize a connection without first waiting for a timeout or a disconnect
		console.log("wifi error emitted", err);
		timer=setInterval(function(){
			connectWifi();
		},10 * 1000);
	});
}

startKommander = function() {
	started = true;
	setTimeout(function() {
		kommand.run(6969, "0.0.0.0", false);
		kommand.on('data', function(cmd) {
			console.log(cmd);
			cmd = cmd.toLowerCase();

			tessel.led[1].write(1);
			setTimeout(function() {
				tessel.led[1].write(0);
			}, .5 * 1000);

			var state = 1;

			if (cmd.indexOf('off') >= 0 || cmd.indexOf('of') >= 0)
				state = 0;

			if (cmd.indexOf('wind') >= 0)
				gpio.digital[2].write(state);
			else if (cmd.indexOf('light') >= 0)
				gpio.digital[3].write(state);
			else if (cmd.indexOf('all') >= 0) {
				gpio.digital[2].write(state);
				gpio.digital[3].write(state);
			}
		});
		tessel.led[0].write(1);
		setTimeout(function() {
			tessel.led[0].write(0);
		}, 2 * 1000);
	}, 2 * 1000);
}

if (wifi.isConnected())
	startKommander();

registerWifiEvent();

setTimeout(function() {
	if (!wifi.isConnected())
		tryConnectWifi();
	if (wifi.isConnected() && !started)
		startKommander();
}, 20 * 1000);