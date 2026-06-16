const socket=io();let currentRoom="",myCards=[];
function joinRoom(){const playerName=document.getElementById("playerName").value.trim();const roomId=document.getElementById("roomId").value.trim();if(!playerName||!roomId){alert("Upiši ime i sobu.");return}currentRoom=roomId;socket.emit("joinRoom",{roomId,playerName});document.getElementById("joinBox").classList.add("hidden");document.getElementById("gameBox").classList.remove("hidden");document.getElementById("roomNameText").innerText=roomId;addLog("Spojen si u sobu "+roomId+".")}
function chooseTrump(trump){socket.emit("chooseTrump",trump);document.getElementById("trumpBox").classList.add("hidden")}
function declarePoints(){socket.emit("declarePoints")}
socket.on("chooseTrump",()=>{document.getElementById("trumpBox").classList.remove("hidden");addLog("Ti biraš adut.")});
socket.on("roomUpdate",d=>{document.getElementById("playersText").innerText=d.count+" / 4 — "+d.players.map(p=>p.name+" (Tim "+p.team+")").join(", ");addLog("Igrači: "+d.players.map(p=>p.name).join(", "))});
socket.on("roomState",d=>{document.getElementById("phaseText").innerText=d.phase;document.getElementById("trumpText").innerText=d.trump||"Nema";document.getElementById("turnText").innerText=d.turnName||"Čekanje";document.getElementById("trickText").innerText=d.trickNumber||0;document.getElementById("scoreA").innerText=d.totalPoints.A;document.getElementById("scoreB").innerText=d.totalPoints.B;document.getElementById("roundA").innerText=d.roundPoints.A;document.getElementById("roundB").innerText=d.roundPoints.B;document.getElementById("declA").innerText=d.declarations.A;document.getElementById("declB").innerText=d.declarations.B});
socket.on("gameStarted",d=>{addLog(d.message);document.getElementById("table").innerHTML=""});
socket.on("trumpSelected",d=>{addLog(d.player+" je odabrao adut: "+d.trump);document.getElementById("trumpBox").classList.add("hidden")});
socket.on("yourCards",cards=>{myCards=cards;renderCards()});
socket.on("yourDeclarations",d=>addLog("Tvoja zvanja: "+d.declarations.map(x=>x.name+" ("+x.points+")").join(", ")+" = "+d.points+" bodova."));
socket.on("declarationMade",d=>addLog(d.player+" ima zvanja: "+d.declarations.map(x=>x.name+" ("+x.points+")").join(", ")+". Tim "+d.team+" +"+d.points+"."));
socket.on("cardPlayed",d=>{const table=document.getElementById("table");const div=document.createElement("div");div.className="playedCard";div.innerText=d.player+": "+d.card.text;if(d.card.suit==="♥"||d.card.suit==="♦")div.classList.add("redSuit");else div.classList.add("blackSuit");table.appendChild(div);addLog(d.player+" je bacio "+d.card.text+".")});
socket.on("trickFinished",d=>{addLog("Štih nosi "+d.winner+" za Tim "+d.team+". Bodovi: "+d.points);setTimeout(()=>document.getElementById("table").innerHTML="",1800)});
socket.on("roundFinished",d=>addLog("Kraj runde. Tim A +"+d.added.A+", Tim B +"+d.added.B+". Ukupno: A "+d.totalPoints.A+" - B "+d.totalPoints.B));
socket.on("gameFinished",d=>{alert("KRAJ IGRE! Pobijedio je Tim "+d.winner);addLog("KRAJ IGRE! Pobijedio je Tim "+d.winner)});
socket.on("turnUpdate",d=>document.getElementById("turnText").innerText=d.turnName);
socket.on("logMessage",addLog);
socket.on("errorMessage",m=>{addLog("⚠️ "+m);alert(m)});
function renderCards(){const box=document.getElementById("cards");box.innerHTML="";myCards.forEach(card=>{const btn=document.createElement("button");btn.className="cardBtn";btn.innerText=card.text;if(card.suit==="♥"||card.suit==="♦")btn.classList.add("redSuit");else btn.classList.add("blackSuit");btn.onclick=()=>socket.emit("playCard",card);box.appendChild(btn)})}
function addLog(text){const log=document.getElementById("log");if(!log)return;const div=document.createElement("div");div.className="logItem";div.innerText=text;log.prepend(div)}
