const socket = io();

let cameraStream = null;
let screenStream = null;
let peer = null;
let adminId = null;

const $ = id => document.getElementById(id);

function status(message) {
  $("status").textContent = message;
}

// Camera permission
$("camera").onclick = async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    $("cameraView").srcObject = cameraStream;
    status("Camera enabled.");
  } catch (error) {
    status("Camera permission denied or unavailable.");
  }
};

// Screen sharing permission
$("screen").onclick = async () => {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    $("screenView").srcObject = screenStream;
    status("Screen sharing enabled.");

    screenStream.getVideoTracks()[0].onended = () => {
      status("Screen sharing stopped.");
      $("screenView").srcObject = null;
    };
  } catch (error) {
    status("Screen sharing cancelled.");
  }
};

// Connect to administrator
$("connect").onclick = () => {
  if (!cameraStream || !screenStream) {
    status("Enable camera and screen sharing first.");
    return;
  }

  socket.emit("visitor:join", {
    name: $("name").value || "Visitor"
  });

  status("Waiting for administrator...");
};

// Receive admin connection offer
socket.on("admin:offer", async ({ offer, adminId: id }) => {
  try {
    adminId = id;
    peer = new RTCPeerConnection();

    cameraStream.getTracks().forEach(track =>
      peer.addTrack(track, cameraStream)
    );

    screenStream.getTracks().forEach(track =>
      peer.addTrack(track, screenStream)
    );

    peer.onicecandidate = event => {
      if (event.candidate) {
        socket.emit("rtc:ice", {
          to: adminId,
          candidate: event.candidate
        });
      }
    };

    await peer.setRemoteDescription(offer);

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socket.emit("visitor:answer", {
      to: adminId,
      answer
    });

    status("Connected to administrator.");
  } catch (error) {
    status("Connection failed. Please try again.");
  }
});

// ICE connection
socket.on("rtc:ice", async ({ candidate }) => {
  if (peer && candidate) {
    try {
      await peer.addIceCandidate(candidate);
    } catch (error) {
      console.error(error);
    }
  }
});

// Photo and video selection
$("files").onchange = () => {
  const selected = [...$("files").files];

  $("send").disabled = !selected.some(file =>
    /^(image\/|video\/)/.test(file.type) &&
    file.size <= 12 * 1024 * 1024
  );
};

// Send selected media only
$("send").onclick = async () => {
  const files = [...$("files").files].filter(file =>
    /^(image\/|video\/)/.test(file.type) &&
    file.size <= 12 * 1024 * 1024
  );

  if (!files.length) return;

  $("send").disabled = true;

  for (const file of files) {
    const data = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    socket.emit("visitor:file", {
      name: file.name,
      mime: file.type,
      data
    });
  }

  status("Selected files sent to administrator.");
  $("send").disabled = false;
};

// Stop sharing
$("stop").onclick = () => {
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  if (peer) peer.close();

  socket.emit("visitor:ended");

  cameraStream = null;
  screenStream = null;
  peer = null;

  $("cameraView").srcObject = null;
  $("screenView").srcObject = null;

  status("Sharing stopped.");
};
