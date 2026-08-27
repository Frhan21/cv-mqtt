const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

// 👉 MQTT: browser connect langsung ke broker via WebSocket (WSS)
const MQTT_URL = "wss://test.mosquitto.org:8081";
const MQTT_TOPIC_PUBLISH = "input/gestur";

const modelInputSize = 640;
const CONFIDENCE_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.4;

// 👉 Nama kelas & warna sesuai metadata.yaml
const CLASS_NAMES = ["mask", "no-mask"];
const CLASS_COLORS = ["lime", "red"];

let model = null;
let mqttClient = null;
let isDetecting = false;
let detectLoopId = null;

// 👉 Throttle pengiriman data ke MQTT
let lastPublishTime = 0;
const PUBLISH_DELAY = 2000;

function setupMqtt() {
  mqttClient = mqtt.connect(MQTT_URL, { reconnectPeriod: 3000 });

  mqttClient.on("connect", () => console.log("Connected to MQTT broker"));
  mqttClient.on("reconnect", () => console.log("Reconnecting to MQTT broker..."));
  mqttClient.on("error", (err) => console.error("MQTT error:", err.message));
}

function publishDetections(results) {
  if (results.length === 0) return;
  if (!mqttClient || !mqttClient.connected) {
    console.warn("MQTT belum terhubung, data tidak dikirim.");
    return;
  }

  const payload = results.map((result) => result.label).join(",");
  mqttClient.publish(MQTT_TOPIC_PUBLISH, payload);
  console.log("Data terkirim ke MQTT:", payload);
}

// Fungsi untuk menyesuaikan ukuran canvas dengan video
function resizeCanvas() {
  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
}

// Setup webcam
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: 640,
      height: 480,
    },
    audio: false,
  });
  video.srcObject = stream;
  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);
      resolve(video);
    };
  });
}

// Load TFJS model
async function loadModel(onProgress) {
  model = await tf.loadGraphModel("./best_web_model/model.json", { onProgress });
  console.log("Model loaded successfully.");
}

// 👉 Warm-up: kompilasi shader backend sebelum deteksi pertama
async function warmUpModel() {
  const dummy = tf.zeros([1, modelInputSize, modelInputSize, 3]);
  const output = model.execute(dummy);
  dummy.dispose();
  output.dispose();
}

// Menggambar bounding box
function drawBox([x, y, w, h], score, label, color) {
  const scaleX = canvas.width / modelInputSize;
  const scaleY = canvas.height / modelInputSize;

  const x1 = (x - w / 2) * scaleX;
  const y1 = (y - h / 2) * scaleY;
  const boxW = w * scaleX;
  const boxH = h * scaleY;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x1, y1, boxW, boxH);

  ctx.fillStyle = color;
  ctx.font = "16px Arial";
  const text = `${label}: ${score.toFixed(2)}`;
  ctx.fillText(text, x1, y1 > 10 ? y1 - 5 : 10);
}

// Terapkan NMS (Non-Max Suppression)
async function applyNMS(boxes, scores) {
  const boxesTensor = tf.tensor2d(boxes);
  const scoresTensor = tf.tensor1d(scores);

  const indices = await tf.image.nonMaxSuppressionAsync(
    boxesTensor,
    scoresTensor,
    20,
    IOU_THRESHOLD,
    CONFIDENCE_THRESHOLD
  );

  const selected = await indices.array();

  boxesTensor.dispose();
  scoresTensor.dispose();
  indices.dispose();

  return selected;
}

// Loop deteksi
async function detectFrame() {
  tf.engine().startScope();

  const input = tf.browser
    .fromPixels(video)
    .resizeBilinear([modelInputSize, modelInputSize])
    .div(255.0)
    .expandDims(0);

  const prediction = await model.execute(input);
  // Transpose output dari [1, 6, 8400] menjadi [8400, 6]
  const data = prediction.transpose([0, 2, 1]).squeeze();
  const predictionsArray = await data.array();

  input.dispose();
  prediction.dispose();
  data.dispose();

  const boxList = [];
  const scoreList = [];
  const classList = [];

  for (const p of predictionsArray) {
    const boxCoords = p.slice(0, 4);
    const classScores = p.slice(4);

    let maxScore = 0;
    let classId = -1;
    for (let i = 0; i < classScores.length; i++) {
      if (classScores[i] > maxScore) {
        maxScore = classScores[i];
        classId = i;
      }
    }

    if (maxScore > CONFIDENCE_THRESHOLD) {
      const [cx, cy, w, h] = boxCoords;
      const y1 = cy - h / 2;
      const x1 = cx - w / 2;
      const y2 = cy + h / 2;
      const x2 = cx + w / 2;
      boxList.push([y1, x1, y2, x2]);
      scoreList.push(maxScore);
      classList.push(classId);
    }
  }

  let selected = [];
  if (boxList.length > 0) {
    selected = await applyNMS(boxList, scoreList);
  }

  // 👉 Guard SETELAH semua await: jika stop ditekan saat inference masih
  // berjalan, bersihkan canvas dan jangan menggambar apa pun
  if (!isDetecting) {
    tf.engine().endScope();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const results = [];

  for (const index of selected) {
    const [y1, x1, y2, x2] = boxList[index];
    const score = scoreList[index];
    const classId = classList[index];
    const label = CLASS_NAMES[classId];
    const color = CLASS_COLORS[classId];

    results.push({ label: label, score: score });

    const w = x2 - x1;
    const h = y2 - y1;

    drawBox([x1 + w / 2, y1 + h / 2, w, h], score, label, color);
  }

  const currentTime = Date.now();
  if (currentTime - lastPublishTime > PUBLISH_DELAY && results.length > 0) {
    publishDetections(results);
    lastPublishTime = currentTime;
  }

  tf.engine().endScope();

  // 👉 Hanya jadwalkan frame berikutnya jika masih mendeteksi
  if (isDetecting) {
    detectLoopId = requestAnimationFrame(detectFrame);
  }
}

// Event listener untuk tombol
startBtn.addEventListener("click", () => {
  if (!model) {
    console.log("Model belum siap, harap tunggu.");
    return;
  }
  if (!isDetecting) {
    isDetecting = true;
    detectFrame();
  }
});

stopBtn.addEventListener("click", () => {
  isDetecting = false;
  if (detectLoopId) {
    cancelAnimationFrame(detectLoopId);
    detectLoopId = null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Inisialisasi
(async () => {
  startBtn.textContent = "Memuat Model... 0%";

  try {
    setupMqtt();
  } catch (err) {
    console.warn("MQTT gagal diinisialisasi:", err);
  }

  try {
    // 👉 Kamera dan model dimuat PARALEL agar loading lebih cepat
    const cameraReady = setupCamera();
    const modelReady = (async () => {
      await tf.ready();
      await loadModel((fraction) => {
        startBtn.textContent = `Memuat Model... ${Math.round(fraction * 100)}%`;
      });
      startBtn.textContent = "Memanaskan Model...";
      await warmUpModel();
    })();

    await Promise.all([cameraReady, modelReady]);

    startBtn.disabled = false;
    startBtn.textContent = "Mulai Deteksi";
    console.log("Setup complete. Ready to start detection.");
  } catch (err) {
    console.error("Setup gagal:", err);
    startBtn.textContent = "Gagal Memuat";
    startBtn.classList.add("bg-red-500");
  }
})();
