const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// ==========================================
// PASSWORDS
// ==========================================

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "Chain1964";

const OWNER_PASSWORD =
    process.env.OWNER_PASSWORD || "Hrithik2017";

// ==========================================
// WEBSITE
// ==========================================

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "Cookie Empire.html")
    );
});

// ==========================================
// GLOBAL DATA
// ==========================================

const players = new Map();

let globalEvent = {
    type: "none",
    endsAt: 0,
    multiplier: 1
};

let announcement = null;

// ==========================================
// HELPERS
// ==========================================

function send(ws, data) {
    if (
        ws &&
        ws.readyState === WebSocket.OPEN
    ) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {
    const message = JSON.stringify(data);

    wss.clients.forEach(client => {
        if (
            client.readyState === WebSocket.OPEN
        ) {
            client.send(message);
        }
    });
}

function getOnlineCount() {
    let count = 0;

    wss.clients.forEach(client => {
        if (
            client.readyState === WebSocket.OPEN
        ) {
            count++;
        }
    });

    return count;
}

function broadcastOnline() {
    broadcast({
        type: "onlineCount",
        count: getOnlineCount()
    });
}

function getPlayer(ws) {
    return players.get(ws.playerId);
}

// ==========================================
// ROLE SYSTEM
// ==========================================

function updatePlayerRole(player) {
    if (!player) return;

    if (player.owner === true) {
        player.role = "OWNER";
        player.admin = true;
        return;
    }

    if (player.coOwner === true) {
        player.role = "CO-OWNER";
        player.admin = true;
        return;
    }

    if (player.developer === true) {
        player.role = "DEVELOPER";
        return;
    }

    if (player.admin === true) {
        player.role = "ADMIN";
        return;
    }

    player.role = "PLAYER";
}

function broadcastPlayers() {
    const list = [];

    players.forEach(player => {
        list.push({
            id: player.id,
            nickname: player.nickname || "Unknown",
            role: player.role || "PLAYER",
            admin: player.admin === true,
            owner: player.owner === true,
            coOwner: player.coOwner === true,
            developer: player.developer === true
        });
    });

    wss.clients.forEach(client => {
        if (
            client.readyState === WebSocket.OPEN &&
            (
                client.isAdmin === true ||
                client.isOwner === true
            )
        ) {
            send(client, {
                type: "playerList",
                players: list
            });
        }
    });
}

// ==========================================
// GLOBAL EVENTS
// ==========================================

function startEvent(type, seconds, multiplier) {
    globalEvent = {
        type: type,
        endsAt: Date.now() + seconds * 1000,
        multiplier: multiplier
    };

    broadcast({
        type: "globalEvent",
        event: globalEvent
    });

    broadcast({
        type: "adminAnnouncement",
        message:
            "🌎 " +
            type +
            " EVENT STARTED!"
    });

    console.log(
        "🌎 Global event started: " +
        type
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

    console.log(
        "🛑 Global event stopped."
    );
}

// ==========================================
// GLOBAL ANNOUNCEMENTS
// ==========================================

function sendGlobalAnnouncement(
    message,
    sender
) {
    const id = crypto.randomUUID();

    const expiresAt =
        Date.now() + 5000;

    announcement = {
        id: id,
        message: message,
        sender: sender,
        createdAt: Date.now(),
        expiresAt: expiresAt
    };

    broadcast({
        type: "announcement",
        message: message,
        sender: sender,
        expiresAt: expiresAt
    });

    console.log(
        "📢 [" +
        sender +
        "]: " +
        message
    );

    setTimeout(() => {
        if (
            announcement &&
            announcement.id === id
        ) {
            announcement = null;

            broadcast({
                type: "announcementClear"
            });
        }
    }, 5000);
}

// ==========================================
// WEBSOCKET CONNECTION
// ==========================================

wss.on("connection", ws => {

    const playerId =
        crypto.randomUUID();

    ws.playerId = playerId;
    ws.isAdmin = false;
    ws.isOwner = false;

    players.set(playerId, {
        id: playerId,
        nickname: "Unknown",
        role: "PLAYER",
        admin: false,
        owner: false,
        coOwner: false,
        developer: false
    });

    console.log(
        "🍪 Player connected: " +
        playerId
    );

    send(ws, {
        type: "connected",
        playerId: playerId,
        online: getOnlineCount()
    });

    // Active event
    if (
        globalEvent.type !== "none"
    ) {
        send(ws, {
            type: "globalEvent",
            event: globalEvent
        });
    }

    // Active announcement
    if (
        announcement &&
        Date.now() < announcement.expiresAt
    ) {
        send(ws, {
            type: "announcement",
            message: announcement.message,
            sender: announcement.sender,
            expiresAt: announcement.expiresAt
        });
    }

    broadcastOnline();
    broadcastPlayers();

    // ======================================
    // MESSAGES
    // ======================================

    ws.on("message", raw => {

        let data;

        try {
            data = JSON.parse(
                raw.toString()
            );
        } catch (error) {
            send(ws, {
                type: "error",
                message: "Invalid message."
            });
            return;
        }

        // ==================================
        // NICKNAME
        // ==================================

        if (
            data.type === "setNickname"
        ) {
            const nickname =
                String(
                    data.nickname || ""
                )
                .trim()
                .slice(0, 20);

            if (!nickname) {
                send(ws, {
                    type: "nicknameResult",
                    success: false,
                    message:
                        "Nickname cannot be empty."
                });
                return;
            }

            const player =
                getPlayer(ws);

            if (!player) {
                send(ws, {
                    type: "nicknameResult",
                    success: false,
                    message:
                        "Player not found."
                });
                return;
            }

            player.nickname = nickname;

            console.log(
                "👤 " +
                nickname +
                " joined."
            );

            send(ws, {
                type: "nicknameResult",
                success: true,
                nickname: nickname
            });

            broadcastPlayers();
            return;
        }

        // ==================================
        // ADMIN LOGIN
        // ==================================

        if (
            data.type === "adminLogin"
        ) {
            const password =
                String(
                    data.password || ""
                );

            if (
                password !==
                ADMIN_PASSWORD
            ) {
                send(ws, {
                    type: "adminLoginResult",
                    success: false
                });
                return;
            }

            ws.isAdmin = true;

            const player =
                getPlayer(ws);

            if (player) {
                player.admin = true;
                updatePlayerRole(player);
            }

            send(ws, {
                type: "adminLoginResult",
                success: true,
                role:
                    player
                        ? player.role
                        : "ADMIN"
            });

            console.log(
                "👑 Admin logged in: " +
                (
                    player
                        ? player.nickname
                        : ws.playerId
                )
            );

            broadcastPlayers();
            return;
        }

        // ==================================
        // OWNER LOGIN
        // ==================================

        if (
            data.type === "ownerLogin"
        ) {
            const password =
                String(
                    data.password || ""
                );

            if (
                password !==
                OWNER_PASSWORD
            ) {
                send(ws, {
                    type: "ownerLoginResult",
                    success: false
                });
                return;
            }

            ws.isOwner = true;
            ws.isAdmin = true;

            const player =
                getPlayer(ws);

            if (player) {
                player.owner = true;
                player.admin = true;
                updatePlayerRole(player);
            }

            send(ws, {
                type: "ownerLoginResult",
                success: true,
                role: "OWNER"
            });

            console.log(
                "👑 OWNER LOGGED IN: " +
                (
                    player
                        ? player.nickname
                        : ws.playerId
                )
            );

            broadcastPlayers();
            return;
        }

        // ==================================
        // OWNER ROLE MANAGEMENT
        // ==================================

        if (
            data.type === "ownerRole"
        ) {
            if (!ws.isOwner) {
                send(ws, {
                    type: "error",
                    message:
                        "Owner authentication required."
                });
                return;
            }

            const targetId =
                String(
                    data.playerId || ""
                );

            const role =
                String(
                    data.role || ""
                ).toUpperCase();

            const target =
                players.get(targetId);

            if (!target) {
                send(ws, {
                    type: "roleResult",
                    success: false,
                    message:
                        "Player not found."
                });
                return;
            }

            if (
                target.owner === true &&
                target.id !== ws.playerId
            ) {
                send(ws, {
                    type: "roleResult",
                    success: false,
                    message:
                        "You cannot change the Owner role."
                });
                return;
            }

            target.admin = false;
            target.coOwner = false;
            target.developer = false;

            if (role === "ADMIN") {
                target.admin = true;
            } else if (
                role === "CO-OWNER"
            ) {
                target.coOwner = true;
                target.admin = true;
            } else if (
                role === "DEVELOPER"
            ) {
                target.developer = true;
            } else if (
                role === "PLAYER"
            ) {
                // PLAYER
            } else {
                send(ws, {
                    type: "roleResult",
                    success: false,
                    message:
                        "Invalid role."
                });
                return;
            }

            updatePlayerRole(target);

            wss.clients.forEach(client => {
                if (
                    client.playerId ===
                    target.id
                ) {
                    client.isAdmin =
                        target.admin === true;

                    client.isOwner =
                        target.owner === true;

                    send(client, {
                        type: "roleUpdated",
                        role: target.role,
                        admin: target.admin,
                        owner: target.owner
                    });
                }
            });

            send(ws, {
                type: "roleResult",
                success: true,
                playerId: target.id,
                nickname: target.nickname,
                role: target.role
            });

            console.log(
                "👑 Owner changed " +
                target.nickname +
                " to " +
                target.role
            );

            broadcastPlayers();
            return;
        }

        // ==================================
        // REMOVE ROLE
        // ==================================

        if (
            data.type === "removeRole"
        ) {
            if (!ws.isOwner) {
                send(ws, {
                    type: "error",
                    message:
                        "Owner authentication required."
                });
                return;
            }

            const targetId =
                String(
                    data.playerId || ""
                );

            const target =
                players.get(targetId);

            if (!target) {
                send(ws, {
                    type: "roleResult",
                    success: false,
                    message:
                        "Player not found."
                });
                return;
            }

            if (target.owner === true) {
                send(ws, {
                    type: "roleResult",
                    success: false,
                    message:
                        "Owner role cannot be removed."
                });
                return;
            }

            target.admin = false;
            target.coOwner = false;
            target.developer = false;

            updatePlayerRole(target);

            wss.clients.forEach(client => {
                if (
                    client.playerId ===
                    target.id
                ) {
                    client.isAdmin = false;
                    client.isOwner = false;

                    send(client, {
                        type: "roleUpdated",
                        role: "PLAYER",
                        admin: false,
                        owner: false
                    });
                }
            });

            send(ws, {
                type: "roleResult",
                success: true,
                playerId: target.id,
                nickname: target.nickname,
                role: "PLAYER"
            });

            console.log(
                "👑 Removed role from " +
                target.nickname
            );

            broadcastPlayers();
            return;
        }

        // ==================================
        // ADMIN PROTECTION
        // ==================================

        if (!ws.isAdmin) {
            send(ws, {
                type: "error",
                message:
                    "Admin authentication required."
            });
            return;
        }

        // ==================================
        // ADMIN EVENTS
        // ==================================

        if (
            data.type === "adminEvent"
        ) {
            switch (data.event) {

                case "cookieRain":
                    startEvent(
                        "cookieRain",
                        30,
                        1
                    );
                    break;

                case "frenzy":
                    startEvent(
                        "frenzy",
                        30,
                        100
                    );
                    break;

                case "goldenStorm":
                    startEvent(
                        "goldenStorm",
                        30,
                        1
                    );
                    break;

                case "glitch":
                    startEvent(
                        "glitch",
                        20,
                        1
                    );
                    break;

                case "apocalypse":
                    startEvent(
                        "apocalypse",
                        15,
                        1
                    );
                    break;

                case "megaReward":

                    broadcast({
                        type: "globalReward",
                        amount: 1000000000
                    });

                    broadcast({
                        type:
                            "adminAnnouncement",
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
                        type:
                            "adminAnnouncement",
                        message:
                            "🛑 GLOBAL EVENT STOPPED."
                    });

                    break;

                default:

                    send(ws, {
                        type: "error",
                        message:
                            "Unknown admin event."
                    });

                    break;
            }

            return;
        }

        // ==================================
        // GLOBAL ANNOUNCEMENT
        // ==================================

        if (
            data.type === "announcement"
        ) {
            const message =
                String(
                    data.message || ""
                )
                .trim()
                .slice(0, 200);

            if (!message) {
                return;
            }

            const player =
                getPlayer(ws);

            const sender =
                player &&
                player.nickname &&
                player.nickname !== "Unknown"
                    ? player.nickname
                    : "Admin";

            sendGlobalAnnouncement(
                message,
                sender
            );

            return;
        }

        // ==================================
        // GET PLAYERS
        // ==================================

        if (
            data.type === "getPlayers"
        ) {
            broadcastPlayers();
            return;
        }
    });

    // ======================================
    // DISCONNECT
    // ======================================

    ws.on("close", () => {

        const player =
            players.get(ws.playerId);

        if (player) {
            console.log(
                "👋 " +
                player.nickname +
                " left."
            );
        }

        players.delete(
            ws.playerId
        );

        broadcastOnline();
        broadcastPlayers();
    });

    // ======================================
    // WEBSOCKET ERROR
    // ======================================

    ws.on("error", error => {
        console.error(
            "WebSocket error:",
            error.message
        );
    });
});

// ==========================================
// EVENT TIMER
// ==========================================

setInterval(() => {

    if (
        globalEvent.type !== "none" &&
        Date.now() >= globalEvent.endsAt
    ) {
        stopEvent();
    }

}, 1000);

// ==========================================
// START SERVER
// ==========================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log(
            "🍪 COOKIE EMPIRE GLOBAL"
        );
        console.log(
            "-----------------------------"
        );
        console.log(
            "🌎 Server running on port " +
            PORT
        );
        console.log(
            "🔌 WebSocket: ACTIVE"
        );
        console.log(
            "👑 Global Admin Abuse: ACTIVE"
        );
        console.log(
            "👤 Nickname System: ACTIVE"
        );
        console.log(
            "👑 Owner System: ACTIVE"
        );
        console.log(
            "🛡️ Role System: ACTIVE"
        );
        console.log(
            "📢 5 Second Announcements: ACTIVE"
        );
        console.log(
            "-----------------------------"
        );
        console.log("");
    }
);

// ==========================================
// SERVER ERROR
// ==========================================

server.on("error", error => {

    console.error(
        "❌ Server error:",
        error
    );
});