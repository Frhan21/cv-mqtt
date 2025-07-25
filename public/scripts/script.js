const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let model;
// 👉 1. Ukuran input model diubah sesuai metadata.yaml
const modelInputSize = 640;
const CONFIDENCE_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.4;

// 👉 2. Nama kelas diperbarui sesuai metadata.yaml
const CLASS_NAMES = ["mask", "no-mask"];
// 👉 Menambahkan warna untuk setiap kelas
const CLASS_COLORS = ["lime", "red"];

let isDetecting = false;
let detectLoopId = null;

let lastApiCallTime = 0;
const API_CALL_DELAY = 1000;

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
    video.onloadedmetadata = () => resolve(video);
  });
}

async function sendData(data) {
  if (data.length === 0) return;

  const payload = data.map((result) => result.label).join(",");
  console.log("Mengirim data (text):", payload);

  try {
    const response = await fetch("/prediction", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: payload,
    });

    if (!response.ok) {
      console.error(`Panggilan API gagal dengan status: ${response.status}`);
    } else {
      const responseText = await response.text();
      console.log("Data berhasil dikirim. Respons server:", responseText);
    }
  } catch (error) {
    console.error("Gagal mengirim data deteksi:", error);
  }
}

// Load TFJS model
async function loadModel() {
  model = await tf.loadGraphModel("model/model.json");
  console.log("Model loaded successfully.");
}

// 👉 Modifikasi: Menggambar bounding box dengan warna dan label yang sesuai
function drawBox([x, y, w, h], score, label, color) {
  const scaleX = canvas.width / modelInputSize;
  const scaleY = canvas.height / modelInputSize;

  const x1 = (x - w / 2) * scaleX;
  const y1 = (y - h / 2) * scaleY;
  const boxW = w * scaleX;
  const boxH = h * scaleY;

  // Atur warna dan gaya teks
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

// Loop deteksi untuk multi-class
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

  const boxList = [];
  const scoreList = [];
  const classList = [];

  for (const prediction of predictionsArray) {
    const boxCoords = prediction.slice(0, 4);
    const classScores = prediction.slice(4);

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

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const results = [];

  for (const index of selected) {
    const [y1, x1, y2, x2] = boxList[index];
    const score = scoreList[index];
    const classId = classList[index];
    const label = CLASS_NAMES[classId];
    const color = CLASS_COLORS[classId]; // 👉 Ambil warna berdasarkan kelas

    const w = x2 - x1;
    const h = y2 - y1;
    const x = x1 + w / 2;
    const y = y1 + h / 2;

    results.push({ label: label, score: score });

    drawBox([x, y, w, h], score, label, color); // 👉 Kirim warna ke fungsi drawBox
  }

  tf.engine().endScope();

  const currentTime = Date.now();
  // 👇 PERBAIKAN DI DUA BARIS INI
  if (currentTime - lastApiCallTime > API_CALL_DELAY && results.length > 0) {
    sendData(results);
    lastApiCallTime = currentTime;
  }

  if (isDetecting) {
    detectLoopId = requestAnimationFrame(detectFrame);
  }
}

// Event listener untuk tombol
document.getElementById("startBtn").addEventListener("click", () => {
  if (!model) {
    console.log("Model not loaded yet, please wait.");
    return;
  }
  if (!isDetecting) {
    isDetecting = true;
    detectFrame();
  }
});

document.getElementById("stopBtn").addEventListener("click", () => {
  isDetecting = false;
  if (detectLoopId) {
    cancelAnimationFrame(detectLoopId);
    detectLoopId = null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Inisialisasi
(async () => {
  await setupCamera();
  await loadModel();
  document.getElementById("startBtn").disabled = false;
  console.log("Setup complete. Ready to start detection.");
})();
