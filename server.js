const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Set this in Render Environment Variables.
// Example:
// ADMIN_PASSWORD=your_password_here
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "CHANGE_ME";

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Cookie Empire.html"));
});

const players = new Map();

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {
    const message = JSON.stringify(data);

    for (const player of players.values()) {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    }
}

function createId() {
    return crypto.randomBytes(8).toString("hex");
}

wss.on("connection", (ws) => {
    const id = createId();

    const player = {
        id,
        ws,
        nickname: "Player",
        cookies: 0,
        cps: 0,
        isAdmin: false
    };

    players.set(id, player);

    send(ws, {
        type: "connected",
        id,
        nickname: player.nickname
    });

    send(ws, {
        type: "playerList",
        players: [...players.values()].map(p => ({
            id: p.id,
            nickname: p.nickname,
            cookies: p.cookies,
            cps: p.cps
        }))
    });

    ws.on("message", (raw) => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        // -----------------------------
        // SET NICKNAME
        // -----------------------------
        if (data.type === "setNickname") {
            let nickname = String(data.nickname || "")
                .trim()
                .replace(/[<>]/g, "");

            if (!nickname) nickname = "Player";

            if (nickname.length > 20) {
                nickname = nickname.substring(0, 20);
            }

            player.nickname = nickname;

            send(ws, {
                type: "nicknameSet",
                nickname
            });

            broadcast({
                type: "playerUpdated",
                player: {
                    id: player.id,
                    nickname: player.nickname,
                    cookies: player.cookies,
                    cps: player.cps
                }
            });

            return;
        }

        // -----------------------------
        // CLICK COOKIE
        // -----------------------------
        if (data.type === "click") {
            player.cookies += 1;

            send(ws, {
                type: "stats",
                cookies: player.cookies,
                cps: player.cps
            });

            return;
        }

        // -----------------------------
        // ADMIN LOGIN
        // -----------------------------
        if (data.type === "adminLogin") {
            if (String(data.password) === ADMIN_PASSWORD) {
                player.isAdmin = true;

                send(ws, {
                    type: "adminLoginResult",
                    success: true
                });
            } else {
                send(ws, {
                    type: "adminLoginResult",
                    success: false
                });
            }

            return;
        }

        // Everything below requires admin
        if (!player.isAdmin) {
            return;
        }

        // -----------------------------
        // ADMIN BROADCAST
        // -----------------------------
        if (data.type === "adminBroadcast") {
            const message = String(data.message || "")
                .trim()
                .substring(0, 300);

            if (!message) return;

            broadcast({
                type: "adminMessage",
                message,
                from: player.nickname
            });

            return;
        }

        // -----------------------------
        // ADMIN GIVE COOKIES
        // -----------------------------
        if (data.type === "adminGiveCookies") {
            const amount = Number(data.amount);

            if (!Number.isFinite(amount)) return;

            if (data.target === "all") {
                for (const p of players.values()) {
                    p.cookies += amount;

                    send(p.ws, {
                        type: "stats",
                        cookies: p.cookies,
                        cps: p.cps
                    });
                }

                broadcast({
                    type: "adminMessage",
                    message: `🍪 Admin gave everyone ${amount} cookies!`,
                    from: player.nickname
                });

            } else {
                const target = players.get(data.target);

                if (!target) return;

                target.cookies += amount;

                send(target.ws, {
                    type: "stats",
                    cookies: target.cookies,
                    cps: target.cps
                });
            }

            return;
        }

        // -----------------------------
        // ADMIN SET COOKIES
        // -----------------------------
        if (data.type === "adminSetCookies") {
            const amount = Number(data.amount);

            if (!Number.isFinite(amount)) return;

            const target = players.get(data.target);

            if (!target) return;

            target.cookies = Math.max(0, amount);

            send(target.ws, {
                type: "stats",
                cookies: target.cookies,
                cps: target.cps
            });

            return;
        }

        // -----------------------------
        // ADMIN SET CPS
        // -----------------------------
        if (data.type === "adminSetCPS") {
            const cps = Number(data.cps);

            if (!Number.isFinite(cps)) return;

            const target = players.get(data.target);

            if (!target) return;

            target.cps = Math.max(0, cps);

            send(target.ws, {
                type: "stats",
                cookies: target.cookies,
                cps: target.cps
            });

            return;
        }

        // -----------------------------
        // ADMIN RESET
        // -----------------------------
        if (data.type === "adminReset") {
            const target = players.get(data.target);

            if (!target) return;

            target.cookies = 0;
            target.cps = 0;

            send(target.ws, {
                type: "stats",
                cookies: 0,
                cps: 0
            });

            return;
        }

        // -----------------------------
        // ADMIN KICK
        // -----------------------------
        if (data.type === "adminKick") {
            const target = players.get(data.target);

            if (!target) return;

            send(target.ws, {
                type: "kicked",
                reason: data.reason || "Kicked by an administrator."
            });

            setTimeout(() => {
                try {
                    target.ws.close();
                } catch {}

                players.delete(target.id);
            }, 100);

            return;
        }

        // -----------------------------
        // ADMIN NUKE ALL
        // -----------------------------
        if (data.type === "adminNuke") {
            for (const p of players.values()) {
                if (p.id === player.id) continue;

                p.cookies = 0;
                p.cps = 0;

                send(p.ws, {
                    type: "stats",
                    cookies: 0,
                    cps: 0
                });
            }

            broadcast({
                type: "adminMessage",
                message: "💥 ADMIN ABUSE: Everyone was nuked!",
                from: player.nickname
            });

            return;
        }
    });

    ws.on("close", () => {
        players.delete(id);

        broadcast({
            type: "playerLeft",
            id
        });
    });
});

server.listen(PORT, () => {
    console.log(`🍪 Cookie Empire running on port ${PORT}`);
});