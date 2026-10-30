const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  throw new Error("Admin password is not configured");
}

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({ status: "online" });
});

io.on("connection", (socket) => {

  socket.on("admin:login", (password, callback) => {
    const success = password === ADMIN_PASSWORD;

    socket.data.isAdmin = success;

    if (success) socket.join("admins");

    if (callback) callback({ ok: success });
  });

  socket.on("visitor:join", (info) => {
    if (!socket.data.isVisitor) {
      socket.data.isVisitor = true;
      socket.data.visitorName =
        String(info.name || "Visitor").slice(0, 40);

      io.to("admins").emit("visitor:waiting", {
        id: socket.id,
        name: socket.data.visitorName
      });
    }
  });

  socket.on("admin:offer", ({ to, offer }) => {
    if (socket.data.isAdmin && to && offer) {
      io.to(to).emit("admin:offer", {
        adminId: socket.id,
        offer
      });
    }
  });

  socket.on("visitor:answer", ({ to, answer }) => {
    if (socket.data.isVisitor && to && answer) {
      io.to(to).emit("visitor:answer", {
        visitorId: socket.id,
        answer
      });
    }
  });

  socket.on("rtc:ice", ({ to, candidate }) => {
    if (to && candidate) {
      io.to(to).emit("rtc:ice", {
        from: socket.id,
        candidate
      });
    }
  });

  socket.on("visitor:file", (file) => {
    if (!socket.data.isVisitor || !file) return;

    if (!/^(image\\/|video\\/)/.test(file.mime || "")) return;
    if (typeof file.data !== "string") return;
    if (file.data.length > 18 * 1024 * 1024) return;

    io.to("admins").emit("visitor:file", {
      visitorId: socket.id,
      visitorName: socket.data.visitorName,
      name: file.name,
      mime: file.mime,
      data: file.data
    });
  });

  socket.on("visitor:ended", () => {
    if (socket.data.isVisitor) {
      io.to("admins").emit("visitor:ended", {
        id: socket.id
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data.isVisitor) {
      io.to("admins").emit("visitor:ended", {
        id: socket.id
      });
    }
  });
});

server.listen(PORT, () => {
  console.log("Aura by K&A is running!");
});
