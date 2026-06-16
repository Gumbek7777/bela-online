const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["7", "8", "9", "J", "Q", "K", "10", "A"];

const NORMAL_POINTS = { "7": 0, "8": 0, "9": 0, "J": 2, "Q": 3, "K": 4, "10": 10, "A": 11 };
const TRUMP_POINTS = { "7": 0, "8": 0, "Q": 3, "K": 4, "10": 10, "A": 11, "9": 14, "J": 20 };

const NORMAL_ORDER = { "7": 1, "8": 2, "9": 3, "J": 4, "Q": 5, "K": 6, "10": 7, "A": 8 };
const TRUMP_ORDER = { "7": 1, "8": 2, "Q": 3, "K": 4, "10": 5, "A": 6, "9": 7, "J": 8 };

function createDeck() {
    let deck = [];

    for (let suit of SUITS) {
        for (let rank of RANKS) {
            deck.push({
                suit,
                rank,
                text: rank + suit
            });
        }
    }

    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
}

function cardPoints(card, trump) {
    return card.suit === trump ? TRUMP_POINTS[card.rank] : NORMAL_POINTS[card.rank];
}

function cardPower(card, trump) {
    return card.suit === trump ? TRUMP_ORDER[card.rank] + 100 : NORMAL_ORDER[card.rank];
}

function createRoom(roomId) {
    rooms[roomId] = {
        id: roomId,
        players: [],
        hands: {},
        started: false,
        phase: "waiting",
        trump: null,
        trumpChooserIndex: 0,
        turnIndex: 0,
        currentTrick: [],
        trickNumber: 0,
        roundPoints: { A: 0, B: 0 },
        totalPoints: { A: 0, B: 0 },
        declarations: { A: 0, B: 0 },
        bela: { A: false, B: false },
        declaredPlayers: {}
    };
}

function getTeamByIndex(index) {
    return index % 2 === 0 ? "A" : "B";
}

function getRoom(socket) {
    return rooms[socket.data.roomId];
}

function getCurrentPlayer(room) {
    return room.players[room.turnIndex];
}

function getTeamBySocketId(room, socketId) {
    let index = room.players.findIndex(p => p.id === socketId);
    return getTeamByIndex(index);
}

function sendRoomState(roomId) {
    const room = rooms[roomId];

    if (!room) return;

    io.to(roomId).emit("roomState", {
        roomId: room.id,
        players: room.players.map((p, index) => ({
            name: p.name,
            index: index + 1,
            team: getTeamByIndex(index)
        })),
        count: room.players.length,
        phase: room.phase,
        trump: room.trump,
        turnName: room.players[room.turnIndex]?.name || "",
        currentTrick: room.currentTrick.map(t => ({
            player: t.playerName,
            card: t.card
        })),
        trickNumber: room.trickNumber,
        roundPoints: room.roundPoints,
        totalPoints: room.totalPoints,
        declarations: room.declarations,
        bela: room.bela
    });
}

function resetRound(room) {
    room.hands = {};
    room.phase = "chooseTrump";
    room.trump = null;
    room.trumpChooserIndex = 0;
    room.turnIndex = 0;
    room.currentTrick = [];
    room.trickNumber = 0;
    room.roundPoints = { A: 0, B: 0 };
    room.declarations = { A: 0, B: 0 };
    room.bela = { A: false, B: false };
    room.declaredPlayers = {};
}

function dealCards(roomId) {
    const room = rooms[roomId];

    if (!room || room.players.length !== 4) return;

    resetRound(room);

    const deck = shuffle(createDeck());

    room.players.forEach((player, index) => {
        room.hands[player.id] = deck.slice(index * 8, index * 8 + 8);
    });

    room.started = true;

    room.players.forEach(player => {
        io.to(player.id).emit("yourCards", room.hands[player.id]);
    });

    io.to(roomId).emit("gameStarted", {
        message: "Karte su podijeljene. Biramo adut."
    });

    askTrump(roomId);
    sendRoomState(roomId);
}

function askTrump(roomId) {
    const room = rooms[roomId];

    if (!room) return;

    room.phase = "chooseTrump";

    const player = room.players[room.trumpChooserIndex];

    io.to(roomId).emit("logMessage", player.name + " bira adut.");
    io.to(player.id).emit("chooseTrump", { suits: SUITS, canPass: true });

    sendRoomState(roomId);
}

function chooseTrump(socket, trump) {
    const room = getRoom(socket);

    if (!room || room.phase !== "chooseTrump") return;

    const chooser = room.players[room.trumpChooserIndex];

    if (!chooser || chooser.id !== socket.id) {
        socket.emit("errorMessage", "Nisi ti na redu za biranje aduta.");
        return;
    }

    if (trump === "pass") {
        io.to(room.id).emit("logMessage", chooser.name + " kaže dalje.");

        room.trumpChooserIndex++;

        if (room.trumpChooserIndex >= 4) {
            room.trumpChooserIndex = 0;
            io.to(room.id).emit("logMessage", "Nitko nije odabrao. Prvi igrač mora odabrati adut.");
        }

        askTrump(room.id);
        return;
    }

    if (!SUITS.includes(trump)) {
        socket.emit("errorMessage", "Neispravan adut.");
        return;
    }

    room.trump = trump;
    room.phase = "play";
    room.turnIndex = room.trumpChooserIndex;

    io.to(room.id).emit("trumpSelected", {
        trump,
        player: chooser.name
    });

    io.to(room.id).emit("logMessage", chooser.name + " je odabrao adut: " + trump + ".");
    sendRoomState(room.id);
}

function playerHasSuit(hand, suit) {
    return hand.some(card => card.suit === suit);
}

function playerHasTrump(hand, trump) {
    return hand.some(card => card.suit === trump);
}

function isLegalCard(room, socketId, card) {
    const hand = room.hands[socketId];

    if (!hand) return { ok: false, message: "Nemaš karte." };

    const realCard = hand.find(c => c.text === card.text);

    if (!realCard) return { ok: false, message: "Nemaš tu kartu." };

    if (room.currentTrick.length === 0) return { ok: true };

    const leadSuit = room.currentTrick[0].card.suit;

    if (realCard.suit === leadSuit) return { ok: true };

    if (playerHasSuit(hand, leadSuit)) {
        return { ok: false, message: "Moraš pratiti boju: " + leadSuit };
    }

    if (
        leadSuit !== room.trump &&
        realCard.suit !== room.trump &&
        playerHasTrump(hand, room.trump)
    ) {
        return { ok: false, message: "Nemaš traženu boju, moraš rezati adutom." };
    }

    return { ok: true };
}

function playCard(socket, card) {
    const room = getRoom(socket);

    if (!room || room.phase !== "play") return;

    const currentPlayer = getCurrentPlayer(room);

    if (!currentPlayer || currentPlayer.id !== socket.id) {
        socket.emit("errorMessage", "Nisi na potezu.");
        return;
    }

    const legal = isLegalCard(room, socket.id, card);

    if (!legal.ok) {
        socket.emit("errorMessage", legal.message);
        return;
    }

    const hand = room.hands[socket.id];
    const index = hand.findIndex(c => c.text === card.text);
    const playedCard = hand.splice(index, 1)[0];

    room.currentTrick.push({
        playerId: socket.id,
        playerName: socket.data.playerName,
        playerIndex: room.turnIndex,
        team: getTeamByIndex(room.turnIndex),
        card: playedCard
    });

    socket.emit("yourCards", hand);

    io.to(room.id).emit("cardPlayed", {
        player: socket.data.playerName,
        card: playedCard,
        trick: room.currentTrick
    });

    if (room.currentTrick.length === 4) {
        finishTrick(room);
    } else {
        room.turnIndex = (room.turnIndex + 1) % 4;

        io.to(room.id).emit("turnUpdate", {
            turnName: getCurrentPlayer(room).name
        });
    }

    sendRoomState(room.id);
}

function finishTrick(room) {
    const leadSuit = room.currentTrick[0].card.suit;

    let winner = room.currentTrick[0];

    for (let play of room.currentTrick) {
        const card = play.card;
        const winnerCard = winner.card;

        if (card.suit === room.trump && winnerCard.suit !== room.trump) {
            winner = play;
        } else if (card.suit === winnerCard.suit) {
            if (cardPower(card, room.trump) > cardPower(winnerCard, room.trump)) {
                winner = play;
            }
        } else if (
            card.suit === leadSuit &&
            winnerCard.suit !== room.trump &&
            winnerCard.suit !== leadSuit
        ) {
            winner = play;
        }
    }

    let trickPoints = 0;

    for (let play of room.currentTrick) {
        trickPoints += cardPoints(play.card, room.trump);
    }

    room.trickNumber++;

    if (room.trickNumber === 8) trickPoints += 10;

    room.roundPoints[winner.team] += trickPoints;
    room.turnIndex = winner.playerIndex;

    io.to(room.id).emit("trickFinished", {
        winner: winner.playerName,
        team: winner.team,
        points: trickPoints,
        roundPoints: room.roundPoints
    });

    io.to(room.id).emit(
        "logMessage",
        "Štih nosi " + winner.playerName + " za Tim " + winner.team + ". Bodovi: " + trickPoints
    );

    room.currentTrick = [];

    if (room.trickNumber >= 8) {
        finishRound(room);
    } else {
        io.to(room.id).emit("turnUpdate", {
            turnName: getCurrentPlayer(room).name
        });
    }
}

function declareBela(socket) {
    const room = getRoom(socket);

    if (!room || room.phase !== "play" || !room.trump) return;

    const hand = room.hands[socket.id] || [];
    const team = getTeamBySocketId(room, socket.id);

    if (room.bela[team]) {
        socket.emit("errorMessage", "Tvoj tim je već prijavio Belu.");
        return;
    }

    const hasKing = hand.some(c => c.suit === room.trump && c.rank === "K");
    const hasQueen = hand.some(c => c.suit === room.trump && c.rank === "Q");

    if (!hasKing || !hasQueen) {
        socket.emit("errorMessage", "Nemaš K i Q aduta za Belu.");
        return;
    }

    room.bela[team] = true;
    room.declarations[team] += 20;

    io.to(room.id).emit("belaDeclared", {
        player: socket.data.playerName,
        team
    });

    io.to(room.id).emit("logMessage", socket.data.playerName + " prijavljuje BELU! Tim " + team + " +20.");
    sendRoomState(room.id);
}

function declarePoints(socket, points) {
    const room = getRoom(socket);

    if (!room || room.phase !== "play") return;

    if (room.declaredPlayers[socket.id]) {
        socket.emit(
            "errorMessage",
            "Već si prijavio zvanje u ovoj rundi."
        );
        return;
    }

    if (room.currentTrick.length > 0) {
        socket.emit(
            "errorMessage",
            "Zvanja se mogu prijaviti samo prije prve karte."
        );
        return;
    }

    points = Number(points);

    if (![20, 50, 100, 150].includes(points)) {
        socket.emit(
            "errorMessage",
            "Neispravno zvanje."
        );
        return;
    }

    room.declaredPlayers[socket.id] = true;

    const team = getTeamBySocketId(room, socket.id);

    room.declarations[team] += points;

    io.to(room.id).emit("declarationMade", {
        player: socket.data.playerName,
        team,
        points
    });

    io.to(room.id).emit(
        "logMessage",
        socket.data.playerName +
        " prijavljuje zvanje " +
        points +
        ". Tim " +
        team +
        " +" +
        points
    );

    sendRoomState(room.id);
}

function finishRound(room) {
    room.phase = "roundEnd";

    const finalA = room.roundPoints.A + room.declarations.A;
    const finalB = room.roundPoints.B + room.declarations.B;

    room.totalPoints.A += finalA;
    room.totalPoints.B += finalB;

    io.to(room.id).emit("roundFinished", {
        roundPoints: room.roundPoints,
        declarations: room.declarations,
        added: { A: finalA, B: finalB },
        totalPoints: room.totalPoints
    });

    io.to(room.id).emit("logMessage", "Kraj runde. Tim A +" + finalA + ", Tim B +" + finalB + ".");

    if (room.totalPoints.A >= 1001 || room.totalPoints.B >= 1001) {
        room.phase = "gameEnd";

        let winner = room.totalPoints.A > room.totalPoints.B ? "A" : "B";

        io.to(room.id).emit("gameFinished", {
            winner,
            totalPoints: room.totalPoints
        });

        io.to(room.id).emit("logMessage", "KRAJ IGRE! Pobijedio je Tim " + winner + ".");
        sendRoomState(room.id);
        return;
    }

    setTimeout(() => {
        dealCards(room.id);
    }, 5000);

    sendRoomState(room.id);
}

io.on("connection", socket => {
    console.log("Igrač spojen:", socket.id);

    socket.on("joinRoom", data => {
        const roomId = data.roomId;
        const playerName = data.playerName;

        if (!roomId || !playerName) return;

        if (!rooms[roomId]) createRoom(roomId);

        const room = rooms[roomId];

        if (room.started) {
            socket.emit("errorMessage", "Igra je već počela.");
            return;
        }

        if (room.players.length >= 4) {
            socket.emit("errorMessage", "Soba je puna.");
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName
        });

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.playerName = playerName;

        io.to(roomId).emit("roomUpdate", {
            roomId,
            players: room.players.map((p, index) => ({
                name: p.name,
                team: getTeamByIndex(index),
                index: index + 1
            })),
            count: room.players.length
        });

        io.to(roomId).emit("logMessage", playerName + " se spojio. Igrača: " + room.players.length + "/4.");

        if (room.players.length === 4) dealCards(roomId);

        sendRoomState(roomId);
    });

    socket.on("chooseTrump", trump => chooseTrump(socket, trump));
    socket.on("setTrump", trump => chooseTrump(socket, trump));
    socket.on("playCard", card => playCard(socket, card));
    socket.on("declareBela", () => declareBela(socket));
    socket.on("declarePoints", points => declarePoints(socket, points));

    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;

        if (!roomId || !rooms[roomId]) return;

        const room = rooms[roomId];

        room.players = room.players.filter(p => p.id !== socket.id);

        io.to(roomId).emit("errorMessage", (socket.data.playerName || "Igrač") + " je izašao iz sobe.");

        io.to(roomId).emit("roomUpdate", {
            roomId,
            players: room.players.map((p, index) => ({
                name: p.name,
                team: getTeamByIndex(index),
                index: index + 1
            })),
            count: room.players.length
        });

        if (room.players.length === 0) delete rooms[roomId];
    });
});

server.listen(3000, () => {
    console.log("Bela Online V2 radi na http://localhost:3000");
});
