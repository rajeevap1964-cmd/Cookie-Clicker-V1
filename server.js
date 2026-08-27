const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// CHANGE THIS IN PRODUCTION.
// Do NOT put the admin password inside index.html.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Chain1964";

app.use(express.static(path.join(__dirname)));

const players = new Map();

let globalEvent = {
    type: "none",
    endsAt: 0,
    multiplier: 1
};

let announcement = "";

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
}

wss.on("connection", ws => {

    const playerId = crypto.randomUUID();

    players.set(playerId, {
        id: playerId,
        admin: false
    });

    ws.playerId = playerId;
    ws.isAdmin = false;

    console.log("🍪 Player connected:", playerId);

    send(ws, {
        type: "connected",
        playerId,
        online: onlineCount()
    });

    if (globalEvent.type !== "none") {
        send(ws, {
            type: "globalEvent",
            event: globalEvent
        });
    }

    if (announcement) {
        send(ws, {
            type: "announcement",
            message: announcement
        });
    }

    broadcastOnline();

    ws.on("message", raw => {

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        /*
         * ADMIN LOGIN
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

                console.log("👑 Admin logged in:", ws.playerId);

            } else {

                send(ws, {
                    type: "adminLoginResult",
                    success: false
                });

            }

            return;
        }

        /*
         * EVERYTHING BELOW HERE REQUIRES ADMIN
         */
        if (!ws.isAdmin) {
            send(ws, {
                type: "error",
                message: "Admin authentication required."
            });

            return;
        }

        /*
         * COOKIE RAIN
         */
        if (data.type === "adminEvent") {

            switch (data.event) {

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


                case "megaReward":

                    broadcast({
                        type: "globalReward",
                        amount: 1000000000
                    });

                    broadcast({
                        type: "adminAnnouncement",
                        message: "💰 EVERYONE RECEIVED 1 BILLION COOKIES!"
                    });

                    break;


                case "stop":

                    stopEvent();

                    broadcast({
                        type: "adminAnnouncement",
                        message: "🛑 GLOBAL EVENT STOPPED."
                    });

                    break;


                default:
                    break;
            }

            return;
        }

        /*
         * GLOBAL ANNOUNCEMENT
         */
        if (data.type === "announcement") {

            const message =
                String(data.message || "")
                    .trim()
                    .slice(0, 200);

            if (!message) return;

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

    ws.on("close", () => {

        players.delete(ws.playerId);

        console.log(
            "🍪 Player disconnected:",
            ws.playerId
        );

        broadcastOnline();

    });

});

setInterval(() => {

    if (
        globalEvent.type !== "none" &&
        Date.now() >= globalEvent.endsAt
    ) {
        stopEvent();
    }

}, 1000);

server.listen(PORT, () => {

    console.log("");
    console.log("🍪 COOKIE EMPIRE GLOBAL");
    console.log("--------------------------------");
    console.log(`🌎 Server: http://localhost:${PORT}`);
    console.log("🔌 WebSocket: ACTIVE");
    console.log("👑 Global Admin Abuse: ACTIVE");
    console.log("--------------------------------");
    console.log("");

});