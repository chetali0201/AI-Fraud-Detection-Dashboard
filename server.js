const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

app.use(express.static(__dirname));

io.on("connection", (socket) => {
    console.log("User Connected");

    // Send live fraud alerts
    setInterval(() => {

        const alertData = {
            title: "Live Fraud Alert",
            desc: "Suspicious transaction detected",
            amount: Math.floor(Math.random() * 50000),
            time: new Date().toLocaleTimeString()
        };

        socket.emit("newAlert", alertData);

    }, 5000);

    socket.on("disconnect", () => {
        console.log("User Disconnected");
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});