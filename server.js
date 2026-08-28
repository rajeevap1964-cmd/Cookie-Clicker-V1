const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Chain1964";

app.use(express.static(__dirname));

app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "Cookie Empire.html"));
});

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

```
wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
        client.send(message);
    }
});
```

}

function getOnlineCount() {
let count = 0;

```
wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
        count++;
    }
});

return count;
```

}

function broadcastOnline() {
broadcast({
type: "onlineCount",
count: getOnlineCount()
});
}

function broadcastPlayers() {
const list = [];

```
players.forEach(player => {
    list.push({
        id: player.id,
        nickname: player.nickname || "Unknown",
        admin: player.admin === true
    });
});

wss.clients.forEach(client => {
    if (
        client.readyState === WebSocket.OPEN &&
        client.isAdmin === true
    ) {
        send(client, {
            type: "playerList",
            players: list
        });
    }
});
```

}

function startEvent(type, seconds, multiplier) {
globalEvent = {
type: type,
endsAt: Date.now() + seconds * 1000,
multiplier: multiplier
};

```
broadcast({
    type: "globalEvent",
    event: globalEvent
});

broadcast({
    type: "adminAnnouncement",
    message: "🌎 " + type + " EVENT STARTED!"
});

console.log("🌎 Global event started: " + type);
```

}

function stopEvent() {
globalEvent = {
type: "none",
endsAt: 0,
multiplier: 1
};

```
broadcast({
    type: "globalEvent",
    event: globalEvent
});

console.log("🛑 Global event stopped.");
```

}

wss.on("connection", ws => {
const playerId = crypto.randomUUID();

```
ws.playerId = playerId;
ws.isAdmin = false;

players.set(playerId, {
    id: playerId,
    nickname: "Unknown",
    admin: false
});

console.log("🍪 Player connected: " + playerId);

send(ws, {
    type: "connected",
    playerId: playerId,
    online: getOnlineCount()
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
broadcastPlayers();

ws.on("message", raw => {
    let data;

    try {
        data = JSON.parse(raw.toString());
    } catch (error) {
        send(ws, {
            type: "error",
            message: "Invalid message."
        });
        return;
    }

    if (data.type === "setNickname") {
        let nickname = String(data.nickname || "")
            .trim()
            .slice(0, 20);

        if (!nickname) {
            send(ws, {
                type: "nicknameResult",
                success: false,
                message: "Nickname cannot be empty."
            });
            return;
        }

        const player = players.get(ws.playerId);

        if (!player) {
            send(ws, {
                type: "nicknameResult",
                success: false,
                message: "Player not found."
            });
            return;
        }

        player.nickname = nickname;

        console.log(
            "👤 " + nickname + " joined."
        );

        send(ws, {
            type: "nicknameResult",
            success: true,
            nickname: nickname
        });

        broadcastPlayers();
        return;
    }

    if (data.type === "adminLogin") {
        const password = String(data.password || "");

        if (password !== ADMIN_PASSWORD) {
            send(ws, {
                type: "adminLoginResult",
                success: false
            });
            return;
        }

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
            "👑 Admin logged in: " + ws.playerId
        );

        broadcastPlayers();
        return;
    }

    if (!ws.isAdmin) {
        send(ws, {
            type: "error",
            message: "Admin authentication required."
        });
        return;
    }

    if (data.type === "adminEvent") {
        switch (data.event) {
            case "cookieRain":
                startEvent("cookieRain", 30, 1);
                break;

            case "frenzy":
                startEvent("frenzy", 30, 100);
                break;

            case "goldenStorm":
                startEvent("goldenStorm", 30, 1);
                break;

            case "glitch":
                startEvent("glitch", 20, 1);
                break;

            case "apocalypse":
                startEvent("apocalypse", 15, 1);
                break;

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

                console.log(
                    "💰 Global reward activated."
                );
                break;

            case "stop":
                stopEvent();

                broadcast({
                    type: "adminAnnouncement",
                    message:
                        "🛑 GLOBAL EVENT STOPPED."
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

    if (data.type === "announcement") {
        const message = String(data.message || "")
            .trim()
            .slice(0, 200);

        if (!message) {
            return;
        }

        announcement = message;

        broadcast({
            type: "announcement",
            message: message
        });

        console.log(
            "📢 Announcement: " + message
        );

        return;
    }

    if (data.type === "getPlayers") {
        broadcastPlayers();
        return;
    }
});

ws.on("close", () => {
    const player = players.get(ws.playerId);

    if (player) {
        console.log(
            "👋 " + player.nickname + " left."
        );
    }

    players.delete(ws.playerId);

    broadcastOnline();
    broadcastPlayers();
});

ws.on("error", error => {
    console.error(
        "WebSocket error:",
        error.message
    );
});
```

});

setInterval(() => {
if (
globalEvent.type !== "none" &&
Date.now() >= globalEvent.endsAt
) {
stopEvent();
}
}, 1000);

server.listen(PORT, "0.0.0.0", () => {
console.log("");
console.log("🍪 COOKIE EMPIRE GLOBAL");
console.log("-----------------------------");
console.log(
"🌎 Server running on port " + PORT
);
console.log("🔌 WebSocket: ACTIVE");
console.log("👑 Global Admin Abuse: ACTIVE");
console.log("👤 Nickname System: ACTIVE");
console.log("-----------------------------");
console.log("");
});

server.on("error", error => {
console.error(
"❌ Server error:",
error
);
});
