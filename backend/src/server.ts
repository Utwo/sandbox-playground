import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { config } from "./config.js";
import {
  createSandboxReq,
  stopSandboxReq,
  addFilesReq,
  deleteFilesReq,
  getFileContentReq,
} from "./modules/container-controller.js";
import wsController from "./modules/container-ws-controller.js";
import {
  getAllPods,
  sendLogsFromSandbox,
  stopSandbox,
} from "./services/k8s.js";
import { getActiveRooms } from "./utils.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ["websocket"] });
app.locals.io = io;

app.use(cors());
app.use(express.json());

const pods = await getAllPods();
pods.forEach((pod) =>
  sendLogsFromSandbox(pod.metadata.name, io, pod.metadata.name, true).catch(
    console.error
  )
);

const {
  socketConnected,
  startNewTerminalCommandWs,
  execCommandWs,
  socketDisconnectWs,
} = wsController(io);

io.on("connection", async (socket) => {
  await socketConnected(socket);
  socket.on("sandbox:terminal:start", startNewTerminalCommandWs);
  socket.on("sandbox:terminal:exec", execCommandWs);
  socket.on("disconnect", socketDisconnectWs);
});

app.post("/create-sandbox", createSandboxReq);
app.delete("/stop-sandbox", stopSandboxReq);
app.post("/add-files", addFilesReq);
app.delete("/delete-files", deleteFilesReq);
app.post("/get-file-content", getFileContentReq);
app.get("/", (req, res) => res.send("ok"));

// delete pods that are not in active rooms
setInterval(async () => {
  const pods = await getAllPods();
  const activeRooms = getActiveRooms(io);

  pods
    .map((pod) => pod.metadata.name)
    .filter((podName) => !activeRooms.includes(podName))
    .forEach((podName) => {
      stopSandbox(podName, true)
        .then(() => {
          console.info(`Pod ${podName} was deleted`);
        })
        .catch((err) => {
          console.error(err);
        });
    });
}, 60 * 10000);

server.listen(config.port, () => {
  console.info(`> Ready on http://localhost:${config.port}`);
});
