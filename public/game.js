const socket = io();

let currentRoom = "";
let myCards = [];

function joinRoom() {
    const playerName = document.getElementById("playerName").value.trim();
    const roomId = document.getElementById("roomId").value.trim();

    if (!playerName || !roomId) {
        alert("Upiši ime i sobu.");
        return;
    }

    currentRoom = roomId;

    socket.emit("joinRoom", {
        roomId,
        playerName
    });

    document.getElementById("joinBox").classList.add("hidden");
    document.getElementById("gameBox").classList.remove("hidden");
    document.getElementById("roomNameText").innerText = roomId;

    addLog("Spojen si u sobu " + roomId + ".");
}

function chooseTrump(trump) {
    socket.emit("chooseTrump", trump);
    document.getElementById("trumpBox").classList.add("hidden");
}

function declareBela() {
    socket.emit("declareBela");
}

function declarePoints(points) {
    socket.emit("declarePoints", points);
}

socket.on("chooseTrump", () => {
    document.getElementById("trumpBox").classList.remove("hidden");
    addLog("Ti biraš adut.");
});

socket.on("roomUpdate", data => {
    document.getElementById("playersText").innerText =
        data.count + " / 4 — " +
        data.players.map(p => p.name + " (Tim " + p.team + ")").join(", ");

    addLog("Igrači: " + data.players.map(p => p.name).join(", "));
});

socket.on("roomState", data => {
    document.getElementById("phaseText").innerText = data.phase;
    document.getElementById("trumpText").innerText = data.trump || "Nema";
    document.getElementById("turnText").innerText = data.turnName || "Čekanje";
    document.getElementById("trickText").innerText = data.trickNumber || 0;

    document.getElementById("scoreA").innerText = data.totalPoints.A;
    document.getElementById("scoreB").innerText = data.totalPoints.B;
    document.getElementById("roundA").innerText = data.roundPoints.A;
    document.getElementById("roundB").innerText = data.roundPoints.B;
    document.getElementById("declA").innerText = data.declarations.A;
    document.getElementById("declB").innerText = data.declarations.B;
});

socket.on("gameStarted", data => {
    addLog(data.message);
    document.getElementById("table").innerHTML = "";
});

socket.on("trumpSelected", data => {
    addLog(data.player + " je odabrao adut: " + data.trump);
    document.getElementById("trumpBox").classList.add("hidden");
});

socket.on("yourCards", cards => {
    myCards = cards;
    renderCards();
});

socket.on("cardPlayed", data => {
    const table = document.getElementById("table");

    const div = document.createElement("div");
    div.className = "playedCard";
    div.innerText = data.player + ": " + data.card.text;

    if (data.card.suit === "♥" || data.card.suit === "♦") {
        div.classList.add("redSuit");
    } else {
        div.classList.add("blackSuit");
    }

    table.appendChild(div);

    addLog(data.player + " je bacio " + data.card.text + ".");
});

socket.on("trickFinished", data => {
    addLog(
        "Štih nosi " +
        data.winner +
        " za Tim " +
        data.team +
        ". Bodovi: " +
        data.points
    );

    setTimeout(() => {
        document.getElementById("table").innerHTML = "";
    }, 1800);
});

socket.on("roundFinished", data => {
    addLog(
        "Kraj runde. Tim A +" +
        data.added.A +
        ", Tim B +" +
        data.added.B +
        ". Ukupno: A " +
        data.totalPoints.A +
        " - B " +
        data.totalPoints.B
    );
});

socket.on("gameFinished", data => {
    alert("KRAJ IGRE! Pobijedio je Tim " + data.winner);
    addLog("KRAJ IGRE! Pobijedio je Tim " + data.winner);
});

socket.on("belaDeclared", data => {
    addLog(data.player + " prijavljuje BELU! Tim " + data.team + " +20.");
});

socket.on("declarationMade", data => {
    addLog(data.player + " prijavljuje zvanje " + data.points + ". Tim " + data.team + ".");
});

socket.on("turnUpdate", data => {
    document.getElementById("turnText").innerText = data.turnName;
});

socket.on("logMessage", message => {
    addLog(message);
});

socket.on("errorMessage", message => {
    addLog("⚠️ " + message);
    alert(message);
});

function renderCards() {
    const box = document.getElementById("cards");
    box.innerHTML = "";

    myCards.forEach(card => {
        const btn = document.createElement("button");

        btn.className = "cardBtn";
        btn.innerText = card.text;

        if (card.suit === "♥" || card.suit === "♦") {
            btn.classList.add("redSuit");
        } else {
            btn.classList.add("blackSuit");
        }

        btn.onclick = () => {
            socket.emit("playCard", card);
        };

        box.appendChild(btn);
    });
}

function addLog(text) {
    const log = document.getElementById("log");

    if (!log) return;

    const div = document.createElement("div");
    div.className = "logItem";
    div.innerText = text;

    log.prepend(div);
}
