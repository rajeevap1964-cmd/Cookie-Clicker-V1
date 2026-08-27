const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

/*
====================================================
COOKIE EMPIRE SERVER
====================================================

IMPORTANT:
Set these environment variables on Render:

ADMIN_PASSWORD=your_admin_password
OWNER_PASSWORD=your_owner_password

Do NOT put your real passwords inside the HTML.
*/

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "CHANGE_ADMIN_PASSWORD";

const OWNER_PASSWORD =
    process.env.OWNER_PASSWORD || "CHANGE_OWNER_PASSWORD";

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Cookie Empire.html"));
});

/*
====================================================
DATA
====================================================
*/

const players = new Map();

const bannedIPs = new Set();
const bannedNames = new Set();

let serverAnnouncement = "";

const ownerRoles = new Set();

/*
====================================================
PLAYER OBJECT
====================================================
*/

function createPlayer(ws, nickname) {
    const id = crypto.randomUUID();

    return {
        id,
        ws,
        nickname,
        cookies: 0,
        cash: 0,
        cps: 0,
        connectedAt: Date.now(),
        isAdmin: false,
        isOwner: false
    };
}

/*
====================================================
NICKNAME
====================================================
*/

function cleanNickname(name) {
    if (typeof name !== "string") return "";

    name = name.trim();

    name = name
        .replace(/[<>]/g, "")
        .replace(/\s+/g, " ");

    if (name.length < 1) return "";
    if (name.length > 20) {
        name = name.substring(0, 20);
    }

    return name;
}

function nicknameTaken(name, exceptId = null) {
    for (const player of players.values()) {
        if (
            player.id !== exceptId &&
            player.nickname.toLowerCase() === name.toLowerCase()
        ) {
            return true;
        }
    }

    return false;
}

/*
====================================================
PLAYER LIST
====================================================
*/

function getPublicPlayers() {
    return [...players.values()].map(player => ({
        id: player.id,
        nickname: player.nickname,
        cookies: Math.floor(player.cookies),
        cash: Math.floor(player.cash),
        cps: Number(player.cps.toFixed(2)),
        isAdmin: player.isAdmin,
        isOwner: player.isOwner
    }));
}

/*
====================================================
SEND
====================================================
*/

function send(ws, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
        ws.send(JSON.stringify(data));
    } catch (err) {
        console.log("Send error:", err.message);
    }
}

function broadcast(data) {
    const message = JSON.stringify(data);

    for (const player of players.values()) {
        if (player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(message);
            } catch {}
        }
    }
}

function broadcastPlayers() {
    broadcast({
        type: "players",
        players: getPublicPlayers()
    });
}

/*
====================================================
SERVER STATE
====================================================
*/

function sendState(player) {
    send(player.ws, {
        type: "state",
        player: {
            id: player.id,
            nickname: player.nickname,
            cookies: player.cookies,
            cash: player.cash,
            cps: player.cps,
            isAdmin: player.isAdmin,
            isOwner: player.isOwner
        },
        players: getPublicPlayers(),
        announcement: serverAnnouncement
    });
}

/*
====================================================
AUTH
====================================================
*/

function authenticateAdmin(player, password) {
    if (password !== ADMIN_PASSWORD) {
        return false;
    }

    player.isAdmin = true;

    return true;
}

function authenticateOwner(player, password) {
    if (password !== OWNER_PASSWORD) {
        return false;
    }

    player.isOwner = true;
    ownerRoles.add(player.nickname.toLowerCase());

    return true;
}

/*
====================================================
WEBSOCKET
====================================================
*/

wss.on("connection", (ws, req) => {

    const ip =
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "unknown";

    let currentPlayer = null;

    send(ws, {
        type: "connected"
    });

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
        ================================================
        JOIN
        ================================================
        */

        if (data.type === "join") {

            let nickname = cleanNickname(data.nickname);

            if (!nickname) {
                send(ws, {
                    type: "joinError",
                    message: "Enter a nickname."
                });

                return;
            }

            if (bannedIPs.has(ip)) {
                send(ws, {
                    type: "joinError",
                    message: "You are banned."
                });

                return;
            }

            if (bannedNames.has(nickname.toLowerCase())) {
                send(ws, {
                    type: "joinError",
                    message: "That nickname is banned."
                });

                return;
            }

            if (nicknameTaken(nickname)) {
                send(ws, {
                    type: "joinError",
                    message: "That nickname is already being used."
                });

                return;
            }

            currentPlayer = createPlayer(ws, nickname);

            /*
            Owner role persists by nickname.
            */
            if (ownerRoles.has(nickname.toLowerCase())) {
                currentPlayer.isOwner = true;
            }

            players.set(currentPlayer.id, currentPlayer);

            sendState(currentPlayer);

            broadcast({
                type: "announcement",
                message: `${nickname} joined Cookie Empire!`
            });

            broadcastPlayers();

            return;
        }

        /*
        ================================================
        SECURITY
        ================================================
        */

        if (!currentPlayer) {
            send(ws, {
                type: "error",
                message: "You must join first."
            });

            return;
        }

        /*
        ================================================
        COOKIE CLICK
        ================================================
        */

        if (data.type === "click") {

            const amount = Number(data.amount);

            if (!Number.isFinite(amount)) return;

            /*
            Prevent ridiculous client-side values.
            */

            const safeAmount = Math.max(
                1,
                Math.min(Math.floor(amount), 100)
            );

            currentPlayer.cookies += safeAmount;
            currentPlayer.cash += safeAmount;

            sendState(currentPlayer);

            return;
        }

        /*
        ================================================
        UPDATE CPS
        ================================================
        */

        if (data.type === "setCps") {

            const cps = Number(data.cps);

            if (!Number.isFinite(cps)) return;

            currentPlayer.cps = Math.max(
                0,
                Math.min(cps, 1000000)
            );

            broadcastPlayers();

            return;
        }

        /*
        ================================================
        ADMIN LOGIN
        ================================================
        */

        if (data.type === "adminLogin") {

            if (authenticateAdmin(currentPlayer, data.password)) {

                send(ws, {
                    type: "adminLoginResult",
                    success: true,
                    message: "Admin access granted."
                });

                sendState(currentPlayer);

            } else {

                send(ws, {
                    type: "adminLoginResult",
                    success: false,
                    message: "Wrong admin password."
                });
            }

            return;
        }

        /*
        ================================================
        OWNER LOGIN
        ================================================
        */

        if (data.type === "ownerLogin") {

            if (authenticateOwner(currentPlayer, data.password)) {

                send(ws, {
                    type: "ownerLoginResult",
                    success: true,
                    message: "Owner access granted."
                });

                sendState(currentPlayer);

                broadcastPlayers();

            } else {

                send(ws, {
                    type: "ownerLoginResult",
                    success: false,
                    message: "Wrong owner password."
                });
            }

            return;
        }

        /*
        ================================================
        OWNER ROLE
        ================================================
        */

        if (data.type === "setOwnerRole") {

            if (!currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Owner access required."
                });

                return;
            }

            const targetId = String(data.playerId || "");

            const target = players.get(targetId);

            if (!target) {

                send(ws, {
                    type: "error",
                    message: "Player not found."
                });

                return;
            }

            const enabled = Boolean(data.enabled);

            target.isOwner = enabled;

            if (enabled) {
                ownerRoles.add(target.nickname.toLowerCase());
            } else {
                ownerRoles.delete(target.nickname.toLowerCase());
            }

            send(target.ws, {
                type: "roleChanged",
                isOwner: target.isOwner
            });

            broadcast({
                type: "announcement",
                message: enabled
                    ? `${target.nickname} is now an Owner! 👑`
                    : `${target.nickname} is no longer an Owner.`
            });

            broadcastPlayers();

            return;
        }

        /*
        ================================================
        GIVE COOKIES
        ================================================
        */

        if (data.type === "giveCookies") {

            if (!currentPlayer.isAdmin && !currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Admin access required."
                });

                return;
            }

            const target = players.get(String(data.playerId || ""));

            if (!target) return;

            let amount = Number(data.amount);

            if (!Number.isFinite(amount)) return;

            amount = Math.max(
                -1000000000,
                Math.min(amount, 1000000000)
            );

            target.cookies += amount;

            if (target.cookies < 0) {
                target.cookies = 0;
            }

            sendState(target);
            broadcastPlayers();

            return;
        }

        /*
        ================================================
        GIVE CASH
        ================================================
        */

        if (data.type === "giveCash") {

            if (!currentPlayer.isAdmin && !currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Admin access required."
                });

                return;
            }

            const target = players.get(String(data.playerId || ""));

            if (!target) return;

            let amount = Number(data.amount);

            if (!Number.isFinite(amount)) return;

            amount = Math.max(
                -1000000000,
                Math.min(amount, 1000000000)
            );

            target.cash += amount;

            if (target.cash < 0) {
                target.cash = 0;
            }

            sendState(target);
            broadcastPlayers();

            return;
        }

        /*
        ================================================
        ANNOUNCEMENT
        ================================================
        */

        if (data.type === "announce") {

            if (!currentPlayer.isAdmin && !currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Admin access required."
                });

                return;
            }

            let message = String(data.message || "").trim();

            message = message.substring(0, 250);

            if (!message) return;

            serverAnnouncement = message;

            broadcast({
                type: "announcement",
                message
            });

            return;
        }

        /*
        ================================================
        KICK
        ================================================
        */

        if (data.type === "kick") {

            if (!currentPlayer.isAdmin && !currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Admin access required."
                });

                return;
            }

            const target = players.get(String(data.playerId || ""));

            if (!target) return;

            /*
            Admin cannot kick Owner.
            Owner cannot be kicked by Admin.
            */

            if (
                target.isOwner &&
                !currentPlayer.isOwner
            ) {

                send(ws, {
                    type: "error",
                    message: "Admins cannot kick an Owner."
                });

                return;
            }

            send(target.ws, {
                type: "kicked",
                message: "You were kicked from Cookie Empire."
            });

            target.ws.close();

            return;
        }

        /*
        ================================================
        BAN
        ================================================
        */

        if (data.type === "ban") {

            if (!currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Owner access required."
                });

                return;
            }

            const target = players.get(String(data.playerId || ""));

            if (!target) return;

            if (target.id === currentPlayer.id) {

                send(ws, {
                    type: "error",
                    message: "You cannot ban yourself."
                });

                return;
            }

            bannedNames.add(target.nickname.toLowerCase());

            send(target.ws, {
                type: "kicked",
                message: "You were banned from Cookie Empire."
            });

            target.ws.close();

            broadcast({
                type: "announcement",
                message: `${target.nickname} was banned.`
            });

            return;
        }

        /*
        ================================================
        UNBAN
        ================================================
        */

        if (data.type === "unban") {

            if (!currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Owner access required."
                });

                return;
            }

            const nickname = cleanNickname(data.nickname);

            bannedNames.delete(nickname.toLowerCase());

            send(ws, {
                type: "notice",
                message: `${nickname} has been unbanned.`
            });

            return;
        }

        /*
        ================================================
        RESET PLAYER
        ================================================
        */

        if (data.type === "resetPlayer") {

            if (!currentPlayer.isAdmin && !currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Admin access required."
                });

                return;
            }

            const target = players.get(String(data.playerId || ""));

            if (!target) return;

            target.cookies = 0;
            target.cash = 0;
            target.cps = 0;

            sendState(target);
            broadcastPlayers();

            return;
        }

        /*
        ================================================
        SERVER RESET
        ================================================
        */

        if (data.type === "serverReset") {

            if (!currentPlayer.isOwner) {

                send(ws, {
                    type: "error",
                    message: "Owner access required."
                });

                return;
            }

            for (const player of players.values()) {

                player.cookies = 0;
                player.cash = 0;
                player.cps = 0;

                sendState(player);
            }

            broadcast({
                type: "announcement",
                message: "🍪 The Owner reset the Cookie Empire!"
            });

            broadcastPlayers();

            return;
        }

        /*
        ================================================
        PING
        ================================================
        */

        if (data.type === "ping") {

            send(ws, {
                type: "pong",
                time: Date.now()
            });

            return;
        }
    });

    /*
    ================================================
    DISCONNECT
    ================================================
    */

    ws.on("close", () => {

        if (!currentPlayer) return;

        players.delete(currentPlayer.id);

        broadcast({
            type: "announcement",
            message: `${currentPlayer.nickname} left Cookie Empire.`
        });

        broadcastPlayers();
    });

    ws.on("error", () => {
        try {
            ws.close();
        } catch {}
    });
});

/*
====================================================
PASSIVE CPS
====================================================
*/

setInterval(() => {

    for (const player of players.values()) {

        if (player.cps <= 0) continue;

        const earned = player.cps / 10;

        player.cookies += earned;
        player.cash += earned;

        sendState(player);
    }

}, 100);

/*
====================================================
START
====================================================
*/

server.listen(PORT, () => {

    console.log("");
    console.log("======================================");
    console.log("🍪 COOKIE EMPIRE SERVER");
    console.log("======================================");
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
    console.log("======================================");
    console.log("");
});