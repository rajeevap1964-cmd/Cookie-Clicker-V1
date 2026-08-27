```js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Set ADMIN_PASSWORD in Render Environment Variables.
// Local fallback for testing only.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Chain1964";

/*
 * ==============================
 * STATIC WEBSITE
 * ==============================
 */

app.use(express.static(path.join(__dirname)));

// IMPORTANT:
// This makes https://your-site.onrender.com/
// automatically open Cookie Empire.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Cookie Empire.html"));
});


/*
 * ==============================
 * GLOBAL SERVER DATA
 * ==============================
 */

const players = new Map();

let globalEvent = {
    type: "none",
    endsAt: 0,
    multiplier: 1
};

let announcement = "";


/*
 * ==============================
 * WEBSOCKET HELPERS
 * ==============================
 */

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {
    const message = JSON.stringify(data);

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function onlineCount() {
    let count = 0;

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            count++;
        }
    });

    return count;
}

function broadcastOnline() {
    broadcast({
        type: "onlineCount",
        count: onlineCount()
    });
}


/*
 * ==============================
 * GLOBAL EVENTS
 * ==============================
 */

function startEvent(type, duration, multiplier = 1) {

    globalEvent = {
        type,
        endsAt: Date.now() + duration,
        multiplier
    };

    broadcast({
        type: "globalEvent",
        event: globalEvent
    });

    console.log(
        `🌎 Global event started: ${type} (${duration / 1000}s)`
    );
}

function stopEvent() {

    globalEvent = {
        type: "none",
        endsAt: 0,
        multiplier: 1
    };

    broadcast({
        type: "globalEvent",
        event: globalEvent
    });

    console.log("🛑 Global event stopped.");
}


/*
 * ==============================
 * WEBSOCKET CONNECTION
 * ==============================
 */

wss.on("connection", ws => {

    const playerId = crypto.randomUUID();

    players.set(playerId, {
        id: playerId,
        admin: false
    });

    ws.playerId = playerId;
    ws.isAdmin = false;

    console.log("🍪 Player connected:", playerId);

    /*
     * Tell player they connected
     */

    send(ws, {
        type: "connected",
        playerId,
        online: onlineCount()
    });


    /*
     * Send current global event
     */

    if (globalEvent.type !== "none") {

        send(ws, {
            type: "globalEvent",
            event: globalEvent
        });

    }


    /*
     * Send current announcement
     */

    if (announcement) {

        send(ws, {
            type: "announcement",
            message: announcement
        });

    }


    /*
     * Update online count
     */

    broadcastOnline();


    /*
     * ==============================
     * MESSAGE HANDLER
     * ==============================
     */

    ws.on("message", raw => {

        let data;

        try {

            data = JSON.parse(raw.toString());

        } catch {

            send(ws, {
                type: "error",
                message: "Invalid message."
            });

            return;
        }


        /*
         * ==============================
         * ADMIN LOGIN
         * ==============================
         */

        if (data.type === "adminLogin") {

            const password = String(data.password || "");

            if (password === ADMIN_PASSWORD) {

                ws.isAdmin = true;

                const player = players.get(ws.playerId);

                if (player) {
                    player.admin = true;
                }

                send(ws, {
                    type: "adminLoginResult",
                    success: true
                });

                console.log(
                    "👑 Admin logged in:",
                    ws.playerId
                );

            } else {

                send(ws, {
                    type: "adminLoginResult",
                    success: false
                });

                console.log(
                    "❌ Failed admin login:",
                    ws.playerId
                );
            }

            return;
        }


        /*
         * ==============================
         * ADMIN PROTECTION
         * ==============================
         */

        if (!ws.isAdmin) {

            send(ws, {
                type: "error",
                message: "Admin authentication required."
            });

            return;
        }


        /*
         * ==============================
         * ADMIN EVENTS
         * ==============================
         */

        if (data.type === "adminEvent") {

            switch (data.event) {


                /*
                 * COOKIE RAIN
                 */

                case "cookieRain":

                    startEvent(
                        "cookieRain",
                        30000,
                        1
                    );

                    broadcast({
                        type: "adminAnnouncement",
                        message: "🌧️ COOKIE RAIN ACTIVATED!"
                    });

                    break;


                /*
                 * FRENZY
                 */

                case "frenzy":

                    startEvent(
                        "frenzy",
                        30000,
                        100
                    );

                    broadcast({
                        type: "adminAnnouncement",
                        message: "⚡ GLOBAL ×100 COOKIE FRENZY!"
                    });

                    break;


                /*
                 * GOLDEN STORM
                 */

                case "goldenStorm":

                    startEvent(
                        "goldenStorm",
                        30000,
                        1
                    );

                    broadcast({
                        type: "adminAnnouncement",
                        message: "🌟 GOLDEN COOKIE STORM!"
                    });

                    break;


                /*
                 * GLITCH
                 */

                case "glitch":

                    startEvent(
                        "glitch",
                        20000,
                        1
                    );

                    broadcast({
                        type: "adminAnnouncement",
                        message: "🌀 GLOBAL GLITCH EVENT!"
                    });

                    break;


                /*
                 * APOCALYPSE
                 */

                case "apocalypse":

                    startEvent(
                        "apocalypse",
                        15000,
                        1
                    );

                    broadcast({
                        type: "adminAnnouncement",
                        message: "☠️ COOKIE APOCALYPSE!"
                    });

                    break;


                /*
                 * MEGA REWARD
                 */

                case "megaReward":

                    broadcast({
                        type: "globalReward",
                        amount: 1000000000
                    });

                    broadcast({
                        type: "adminAnnouncement",
                        message:
                            "💰 EVERYONE RECEIVED 1 BILLION COOKIES!"
                    });

                    break;


                /*
                 * STOP EVENT
                 */

                case "stop":

                    stopEvent();

                    broadcast({
                        type: "adminAnnouncement",
                        message: "🛑 GLOBAL EVENT STOPPED."
                    });

                    break;


                default:

                    send(ws, {
                        type: "error",
                        message: "Unknown admin event."
                    });

                    break;
            }

            return;
        }


        /*
         * ==============================
         * GLOBAL ANNOUNCEMENT
         * ==============================
         */

        if (data.type === "announcement") {

            const message =
                String(data.message || "")
                    .trim()
                    .slice(0, 200);

            if (!message) {
                return;
            }

            announcement = message;

            broadcast({
                type: "announcement",
                message
            });

            console.log(
                "📢 Announcement:",
                message
            );

            return;
        }

    });


    /*
     * ==============================
     * PLAYER DISCONNECTED
     * ==============================
     */

    ws.on("close", () => {

        players.delete(ws.playerId);

        console.log(
            "🍪 Player disconnected:",
            ws.playerId
        );

        broadcastOnline();

    });


    /*
     * ==============================
     * WEBSOCKET ERROR
     * ==============================
     */

    ws.on("error", error => {

        console.error(
            "WebSocket error:",
            error.message
        );

    });

});


/*
 * ==============================
 * EVENT TIMER
 * ==============================
 */

setInterval(() => {

    if (
        globalEvent.type !== "none" &&
        Date.now() >= globalEvent.endsAt
    ) {

        stopEvent();

    }

}, 1000);


/*
 * ==============================
 * START SERVER
 * ==============================
 */

server.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("🍪 COOKIE EMPIRE GLOBAL");
    console.log("--------------------------------");
    console.log(`🌎 Server running on port ${PORT}`);
    console.log("🔌 WebSocket: ACTIVE");
    console.log("👑 Global Admin Abuse: ACTIVE");
    console.log("--------------------------------");
    console.log("");

});


/*
 * ==============================
 * SERVER ERROR HANDLER
 * ==============================
 */

server.on("error", error => {

    console.error("❌ Server error:", error);

});
```
