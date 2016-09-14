/**
 * # Waiting Room
 * Copyright(c) {YEAR} {AUTHOR} <{AUTHOR_EMAIL}>
 * MIT Licensed
 *
 * Handles incoming connections, setups each client,
 * moves them in a separate game room, and starts the game.
 *
 * @see GameRoom
 */
module.exports = function(settings, waitRoom, runtimeConf) {

    // Load the code database.
    var J = require('JSUS').JSUS;

    var node = waitRoom.node;
    var channel = waitRoom.channel;

    var stager = new node.Stager();

    // Parses the settings.
    waitRoom.parseSettings(settings);

    function clientReconnects(p) {
        channel.sysLogger.log('Reconnection in the waiting room.', p);
        node.game.pl.add(p);
        clientConnects(p);
    }

    function clientDisconnects(p) {
        var wRoom, i;

        // Clear timeout in any case.
        waitRoom.clearTimeOut(p.id);

        // Client really disconnected (not moved into another game room).
        if (channel.registry.clients.disconnected.get(p.id)) {
            // Free up the code.
            channel.registry.markValid(p.id);
        }

        // Call ON_DISCONNECT, if found.
        if (waitRoom.ON_DISCONNECT) waitRoom.ON_DISCONNECT(waitRoom, p);

        // Notify players that somebody disconnected.
        notifyNP();
    }

    // Sends to players the current number of players.
    // Updates are sent with a timeout, unless the number is specified.
    function notifyNP(np) {
        if ('number' === typeof np) {
            node.say('PLAYERSCONNECTED', 'ROOM', np);
        }
        else if (!node.game.notifyTimeout) {
            // Group together a few connect-notifications
            // before sending them.
            node.game.notifyTimeout = setTimeout(function() {
                // Delete timeout.
                node.game.notifyTimeout = null;
                // Notify all players of new connection/s.
                node.say('PLAYERSCONNECTED', 'ROOM',
                         node.game.pl.size());
            }, 200);
        }
    }

    // Using self-calling function to put `firstTime` into closure.
    function clientConnects(p) {
        var pList;
        var nPlayers;
        var waitTime;
        var widgetConfig;
        var n;

        // TODO: send only one message?

        node.remoteCommand('stop', p.id);

        node.remoteSetup('page', p.id, {
            clearBody: true,
            title: { title: 'Welcome!', addToBody: true }
        });

        node.remoteSetup('widgets', p.id, {
            destroyAll: true,
            append: { 'WaitingRoom': {} }
        });

        if (waitRoom.isRoomOpen()) {
            console.log('Client connected to waiting room: ', p.id);

            // Mark code as used.
            channel.registry.markInvalid(p.id);

            pList = waitRoom.clients.player;
            nPlayers = pList.size();

            if (waitRoom.START_DATE) {
                waitTime = new Date(waitRoom.START_DATE).getTime() -
                    (new Date().getTime());
            }
            else if (waitRoom.MAX_WAIT_TIME) {
                waitTime = waitRoom.MAX_WAIT_TIME;
            }
            else {
                waitTime = null; // Widget won't start timer.
            }

            // Send the number of minutes to wait and all waitRoom settings.
            widgetConfig = waitRoom.makeWidgetConfig();
            widgetConfig.waitTime = waitTime;
            node.remoteSetup('waitroom', p.id, widgetConfig);

            console.log('NPL ', nPlayers);

            // Call ON_CONNECT, if found.
            if (waitRoom.ON_CONNECT) waitRoom.ON_CONNECT(waitRoom, p);

            // Start counting a timeout for max stay in waiting room.
            waitRoom.makeTimeOut(p.id, waitTime);

            // In TIMEOUT mode it does not matter how many players we have.
            // Dispatch will happen at a certain time in the future.
            if (waitRoom.EXECUTION_MODE !== 'WAIT_FOR_N_PLAYERS') return;

            // Wait for all players to connect.
            if (nPlayers < waitRoom.POOL_SIZE) {
                notifyNP();
            }
            // Prepare to dispatch!
            else {

                // Send immediately the number of players notification.
                notifyNP(nPlayers);

                if (node.game.notifyTimeout) {
                    node.game.notifyTimeout = null;
                    clearTimeout(node.game.notifyTimeout);
                }

                // Number of games requested.
                n = Math.floor(waitRoom.POOL_SIZE / waitRoom.GROUP_SIZE);

                // Dispatch immediately.
                if (nPlayers === 1) {
                    waitRoom.dispatch({
                        numberOfGames: n
                    });
                }
                // Timeout0: make sure other messages are sent
                // (players can be disconnected by dispatch).
                else {
                    setTimeout(function() {
                        waitRoom.dispatch({
                            numberOfGames: n
                        });
                    });
                }
            }
        }
        else {
            // Call ON_CONNECT, if found.
            if (waitRoom.ON_CONNECT) waitRoom.ON_CONNECT(waitRoom, p);
            // Also disconnects (client-side).
            node.say('ROOM_CLOSED', p.id);
        }
    }

    function monitorReconnects(p) {
        node.game.ml.add(p);
    }

    stager.setOnInit(function() {

        this.notifyTimeout = null;

        // This callback is executed when a player connects to the channel.
        node.on.pconnect(clientConnects);

        // This callback is executed when a player connects to the channel.
        node.on.pdisconnect(clientDisconnects);

        // This callback is executed whenever a player reconnects.
        node.on.preconnect(clientReconnects);

        // This must be done manually for now.
        // (maybe will change in the future).
        node.on.mreconnect(monitorReconnects);

        channel.sysLogger.log('Waiting Room Created');
    });

    stager.setDefaultProperty('publishLevel', 0);

    stager.stage('waiting');

    return {
        nodename: 'standard_wroom',
        plot: stager.getState(),
        debug: settings.debug || false,
        verbosity: 0
    };
};
