import {
    Room,
    RoomEvent,
    Track
} from "https://cdn.jsdelivr.net/npm/livekit-client@2.23.0/+esm";

// =====================================
// CONFIGURATION
// =====================================

// Gunakan URL server LiveKit dari proyek yang sama
// dengan API Key dan API Secret di Render.
const LIVEKIT_URL = "wss://heiwaworks-fplzprun.livekit.cloud";


// =====================================
// ELEMENTS
// =====================================

const homeView = document.getElementById("homeView");
const roomView = document.getElementById("roomView");

const displayNameInput = document.getElementById("displayName");
const roomCodeInput = document.getElementById("roomCode");

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");

const homeError = document.getElementById("homeError");

const roomTitle = document.getElementById("roomTitle");
const roomSubtitle = document.getElementById("roomSubtitle");

const copyInviteBtn = document.getElementById("copyInviteBtn");
const participantGrid = document.getElementById("participantGrid");
const participantCount = document.getElementById("participantCount");
const roomStatus = document.getElementById("roomStatus");

const micBtn = document.getElementById("micBtn");
const deafenBtn = document.getElementById("deafenBtn");
const leaveBtn = document.getElementById("leaveBtn");

const toast = document.getElementById("toast");

// =====================================
// CHECK REQUIRED ELEMENTS
// =====================================

const requiredElements = {
    homeView,
    roomView,
    displayNameInput,
    roomCodeInput,
    createBtn,
    joinBtn,
    homeError,
    roomTitle,
    roomSubtitle,
    copyInviteBtn,
    participantGrid,
    participantCount,
    roomStatus,
    micBtn,
    deafenBtn,
    leaveBtn,
    toast
};

for (const [name, element] of Object.entries(requiredElements)) {
    if (!element) {
        throw new Error(`Elemen HTML tidak ditemukan: ${name}`);
    }
}

// =====================================
// STATE
// =====================================

let livekitRoom = null;

let currentRoomCode = "";
let currentName = "";

let isMuted = false;
let isDeafened = false;
let isConnecting = false;

let toastTimer = null;

// =====================================
// UTILITIES
// =====================================

function showError(message = "") {
    homeError.textContent = message;
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function setLoading(button, loading, originalText) {
    button.disabled = loading;
    button.dataset.originalText ??= originalText;

    button.textContent = loading
        ? "Menghubungkan..."
        : button.dataset.originalText;
}

function getInitials(name) {
    return name.trim().charAt(0).toUpperCase() || "?";
}

function getRoomCodeFromUrl() {
    return new URLSearchParams(window.location.search).get("room") || "";
}

function updateInviteUrl(code) {
    const url = new URL(window.location.href);

    url.searchParams.set("room", code);

    window.history.replaceState({}, "", url);
}

function clearInviteUrl() {
    const url = new URL(window.location.href);

    url.searchParams.delete("room");

    window.history.replaceState({}, "", url);
}

// =====================================
// INVITATION LINK
// =====================================

const invitedRoom = getRoomCodeFromUrl();

if (invitedRoom) {
    roomCodeInput.value = invitedRoom;
}

// =====================================
// CREATE ROOM
// =====================================

createBtn.addEventListener("click", () => {
    const name = displayNameInput.value.trim();

    if (!name) {
        showError("Masukkan nama kamu terlebih dahulu.");
        displayNameInput.focus();
        return;
    }

    if (name.length > 32) {
        showError("Nama maksimal 32 karakter.");
        return;
    }

    const code = crypto.randomUUID()
        .replaceAll("-", "")
        .slice(0, 8)
        .toUpperCase();

    connectToRoom(code, name);
});

// =====================================
// JOIN ROOM
// =====================================

joinBtn.addEventListener("click", () => {
    const name = displayNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();

    if (!name) {
        showError("Masukkan nama kamu terlebih dahulu.");
        displayNameInput.focus();
        return;
    }

    if (!code) {
        showError("Masukkan kode room.");
        roomCodeInput.focus();
        return;
    }

    if (name.length > 32) {
        showError("Nama maksimal 32 karakter.");
        return;
    }

    if (code.length > 64) {
        showError("Kode room terlalu panjang.");
        return;
    }

    connectToRoom(code, name);
});

// =====================================
// CONNECT TO LIVEKIT
// =====================================

async function connectToRoom(code, name) {
    if (isConnecting || livekitRoom) return;

    isConnecting = true;

    showError("");

    setLoading(createBtn, true, "＋ Buat room baru");
    setLoading(joinBtn, true, "Gabung");

    try {
        currentRoomCode = code;
        currentName = name;

        roomStatus.textContent = "Meminta akses mikrofon...";

        // Request microphone permission first.
        const microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });

        microphoneStream.getTracks().forEach(track => track.stop());

        roomStatus.textContent = "Meminta token LiveKit...";

        // Generate participant token from LiveKit.
const response = await fetch("/api/token", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        room: code,
        name: name
    })
});

const data = await response.json();

if (!response.ok) {
    throw new Error(data.error || "Gagal mendapatkan token.");
}

if (!data.token) {
    throw new Error("Token LiveKit tidak valid.");
}

        // Create room.
        livekitRoom = new Room({
            adaptiveStream: true,
            dynacast: true
        });

        registerRoomEvents();

        roomStatus.textContent = "Menghubungkan ke voice room...";

await livekitRoom.connect(
    LIVEKIT_URL,
    data.token
);

        // Enable microphone.
        await livekitRoom.localParticipant.setMicrophoneEnabled(true);

        isMuted = false;
        isDeafened = false;

        showRoomView();

        updateParticipants();
        updateControls();

        roomStatus.textContent = "Terhubung! Silakan ngobrol.";

        micBtn.disabled = false;
        deafenBtn.disabled = false;

        updateInviteUrl(code);

    } catch (error) {
        console.error("VoiceChat connection error:", error);

        let message = error.message || "Tidak dapat bergabung ke room.";

        if (error.name === "NotAllowedError") {
            message = "Izin mikrofon ditolak. Izinkan akses mikrofon di browser.";
        }

        showError(message);

        if (livekitRoom) {
            livekitRoom.removeAllListeners();

            try {
                await livekitRoom.disconnect();
            } catch (disconnectError) {
                console.error("Disconnect error:", disconnectError);
            }

            livekitRoom = null;
        }

        clearInviteUrl();
        showHomeView();

    } finally {
        isConnecting = false;

        setLoading(createBtn, false, "＋ Buat room baru");
        setLoading(joinBtn, false, "Gabung");
    }
}

// =====================================
// LIVEKIT EVENTS
// =====================================

function registerRoomEvents() {
    livekitRoom.on(RoomEvent.ParticipantConnected, () => {
        updateParticipants();
        showToast("Peserta baru bergabung.");
    });

    livekitRoom.on(RoomEvent.ParticipantDisconnected, () => {
        updateParticipants();
    });

    livekitRoom.on(
        RoomEvent.TrackSubscribed,
        (track, publication, participant) => {
            if (track.kind === Track.Kind.Audio) {
                const audioElement = track.attach();

                audioElement.autoplay = true;
                audioElement.playsInline = true;
                audioElement.volume = isDeafened ? 0 : 1;

                document.body.appendChild(audioElement);

                audioElement.play().catch(error => {
                    console.warn("Audio autoplay blocked:", error);
                });
            }

            updateParticipants();
        }
    );

    livekitRoom.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(element => element.remove());
        updateParticipants();
    });

    livekitRoom.on(RoomEvent.LocalTrackPublished, () => {
        updateParticipants();
    });

    livekitRoom.on(RoomEvent.LocalTrackUnpublished, () => {
        updateParticipants();
    });

    livekitRoom.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        updateParticipants(speakers);
    });

    livekitRoom.on(RoomEvent.Disconnected, () => {
        livekitRoom = null;

        showHomeView();
        showToast("Koneksi terputus.");
    });
}

// =====================================
// PARTICIPANTS
// =====================================

function updateParticipants(
    activeSpeakers = livekitRoom?.activeSpeakers || []
) {
    if (!livekitRoom) return;

    const localParticipant = livekitRoom.localParticipant;

    const participants = [
        localParticipant,
        ...Array.from(livekitRoom.remoteParticipants.values())
    ];

    participantGrid.innerHTML = "";

    const speakingIdentities = new Set(
        activeSpeakers.map(participant => participant.identity)
    );

    participants.forEach(participant => {
        const isLocal =
            participant.identity === localParticipant.identity;

        const isSpeaking =
            speakingIdentities.has(participant.identity);

        const displayName = isLocal
            ? currentName
            : participant.name || participant.identity;

        const card = document.createElement("div");
        card.className = `person-card ${isSpeaking ? "speaking" : ""}`;

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = getInitials(displayName);

        const name = document.createElement("div");
        name.className = "person-name";
        name.textContent = isLocal
            ? `${displayName} (Kamu)`
            : displayName;

        const state = document.createElement("div");
        state.className = `person-state ${isSpeaking ? "talking" : ""}`;

        const microphonePublication = participant.getTrackPublication(
            Track.Source.Microphone
        );

        const microphoneOff = isLocal
            ? isMuted
            : !microphonePublication || microphonePublication.isMuted;

        state.textContent = microphoneOff
            ? "Mikrofon mati"
            : isSpeaking
                ? "Sedang berbicara"
                : "Terhubung";

        card.append(avatar, name, state);
        participantGrid.appendChild(card);
    });

    participantCount.textContent = `${participants.length} peserta`;
}

// =====================================
// MICROPHONE
// =====================================

micBtn.addEventListener("click", async () => {
    if (!livekitRoom) return;

    const previousMutedState = isMuted;
    const nextMutedState = !isMuted;

    try {
        await livekitRoom.localParticipant.setMicrophoneEnabled(
            !nextMutedState
        );

        isMuted = nextMutedState;

        updateControls();
        updateParticipants();

    } catch (error) {
        console.error("Microphone error:", error);

        isMuted = previousMutedState;

        showToast("Gagal mengubah mikrofon.");

        updateControls();
    }
});

// =====================================
// DEAFEN
// =====================================

deafenBtn.addEventListener("click", () => {
    if (!livekitRoom) return;

    isDeafened = !isDeafened;

    document.querySelectorAll("audio").forEach(audio => {
        audio.volume = isDeafened ? 0 : 1;
    });

    updateControls();

    showToast(
        isDeafened
            ? "Audio teman dimatikan."
            : "Audio teman dinyalakan."
    );
});

// =====================================
// UPDATE CONTROLS
// =====================================

function updateControls() {
    micBtn.classList.toggle("active", isMuted);
    deafenBtn.classList.toggle("active", isDeafened);

    micBtn.querySelector("span:last-child").textContent =
        isMuted ? "Unmute" : "Mute";

    deafenBtn.querySelector("span:last-child").textContent =
        isDeafened ? "Undeafen" : "Deafen";

    micBtn.querySelector(".control-icon").textContent =
        isMuted ? "🔇" : "🎙";

    deafenBtn.querySelector(".control-icon").textContent =
        isDeafened ? "🔈" : "🎧";
}

// =====================================
// COPY INVITATION
// =====================================

copyInviteBtn.addEventListener("click", async () => {
    if (!currentRoomCode) return;

    const inviteUrl = new URL(window.location.href);

    inviteUrl.searchParams.set("room", currentRoomCode);

    try {
        await navigator.clipboard.writeText(inviteUrl.toString());

        showToast("Link undangan berhasil disalin!");

    } catch (error) {
        console.error("Clipboard error:", error);

        showToast("Tidak dapat menyalin link.");
    }
});

// =====================================
// LEAVE ROOM
// =====================================

leaveBtn.addEventListener("click", leaveRoom);

async function leaveRoom() {
    if (livekitRoom) {
        const room = livekitRoom;

        // Prevent disconnected event from handling manual leave.
        room.removeAllListeners();

        livekitRoom = null;

        try {
            await room.disconnect();
        } catch (error) {
            console.error("Leave room error:", error);
        }
    }

    document.querySelectorAll("audio").forEach(audio => {
        audio.remove();
    });

    isMuted = false;
    isDeafened = false;

    currentRoomCode = "";
    currentName = "";

    clearInviteUrl();

    showHomeView();

    showToast("Kamu telah keluar dari room.");
}

// =====================================
// VIEW MANAGEMENT
// =====================================

function showRoomView() {
    homeView.classList.add("hidden");
    roomView.classList.remove("hidden");

    roomTitle.textContent = currentRoomCode;

    roomSubtitle.textContent =
        `Bergabung sebagai ${currentName}`;
}

function showHomeView() {
    roomView.classList.add("hidden");
    homeView.classList.remove("hidden");

    participantGrid.innerHTML = "";
    participantCount.textContent = "0 peserta";

    micBtn.disabled = true;
    deafenBtn.disabled = true;

    roomStatus.textContent = "Belum terhubung.";

    updateControls();
}
