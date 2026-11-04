const express = require("express");
const dotenv = require("dotenv");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { AccessToken } = require("livekit-server-sdk");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/token", async (req, res) => {
    try {
        const API_KEY = process.env.LIVEKIT_API_KEY;
        const API_SECRET = process.env.LIVEKIT_API_SECRET;

        if (!API_KEY || !API_SECRET) {
            return res.status(500).json({
                error: "Konfigurasi LiveKit belum lengkap."
            });
        }

        const room = String(req.body.room || "").trim();
        const name = String(req.body.name || "").trim();

        if (!room || !name) {
            return res.status(400).json({
                error: "Nama dan kode room wajib diisi."
            });
        }

        if (room.length > 64 || name.length > 32) {
            return res.status(400).json({
                error: "Nama atau kode room terlalu panjang."
            });
        }

        const identity = `user-${randomUUID()}`;

        const token = new AccessToken(API_KEY, API_SECRET, {
            identity,
            name
        });

        token.addGrant({
            roomJoin: true,
            room,
            canPublish: true,
            canSubscribe: true
        });

        const jwt = await token.toJwt();

        res.json({
            token: jwt,
            identity,
            room
        });

    } catch (error) {
        console.error("Token error:", error);

        res.status(500).json({
            error: "Gagal membuat token LiveKit."
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`VoiceChat berjalan di port ${PORT}`);
});