const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const cameraStream = document.getElementById("cameraStream");

let model;
const modelInputSize = 480;
const CONFIDENCE_THRESHOLD = 0.5;
const IOU_THRESHOLD = 0.4;

const CLASS_NAMES = ["Mobil", "PengendaraMotor", "pejalan kaki"];
// 👉 Menambahkan warna untuk setiap kelas
const CLASS_COLORS = ["lime", "red", "blue"];

let isDetecting = false;
let detectLoopId = null;

// 👉 Variabel untuk throttling API
let lastApiCallTime = 0;
const API_CALL_DELAY = 2000; // Delay dalam milidetik (1000ms = 1 detik)

// Fungsi untuk menyesuaikan ukuran canvas dengan video
function resizeCanvas() {
  canvas.width = cameraStream.clientWidth;
  canvas.height = cameraStream.clientHeight;
}

// Setup API Function
async function sendData(data) {
  if (data.length === 0) return;

  // Ambil hanya labelnya dan gabungkan menjadi satu string dipisahkan koma
  const payload = data.map((result) => result.label).join(",");

  // const payload = {
  //     "datetime": new Date().toISOString(),
  //     "data": data
  // }

  console.log("Mengirim data (text):", payload);

  try {
    const response = await fetch("/prediction", {
      method: "POST",
      headers: {
        // Ubah tipe konten menjadi text/plain
        "Content-Type": "text/plain", //kalo mau text aja ==> text/plain, ganti bagian ini
      },
      // Kirim string mentah sebagai body
      body: payload,
    });

    if (!response.ok) {
      console.error(`Panggilan API gagal dengan status: ${response.err}`);
    } else {
      // Baca respons dari server sebagai teks
      const responseText = await response.text();
      console.log("Data berhasil dikirim. Respons server:", responseText);
    }
  } catch (error) {
    console.error("Gagal mengirim data deteksi:", error);
  }
}

// Setup webcam
// Setup webcam (DIPERBAIKI UNTUK MJPEG DENGAN <img>)

async function setupCamera(ipAddress = "http://localhost:3000/stream") {
  if (!video || !cameraStream) {
    console.error("Elemen video atau cameraStream tidak ditemukan.");
    return null;
  }

  cameraStream.crossOrigin = "anonymous";
  cameraStream.src = ipAddress;
  console.log(`Mencoba memuat stream dari proxy server: ${ipAddress}`);

  return new Promise((resolve, reject) => {
    cameraStream.onload = () => {
      console.log(`Stream berhasil dimuat dari proxy ${ipAddress}`);
      video.width = cameraStream.naturalWidth || 640;
      video.height = cameraStream.naturalHeight || 480;
      resizeCanvas();
      resolve(cameraStream);
    };

    cameraStream.onerror = (e) => {
      console.error(`Gagal memuat stream dari ${ipAddress}`, e);
      alert(
        "Tidak dapat memuat stream. Pastikan server dan kamera ESP32-CAM aktif."
      );
      reject(new Error("Stream gagal dimuat dari proxy server."));
    };
  });
}

// FUNGSI resizeCanvas() DIPERBAIKI (HARUS MENGACU KE UKURAN <img>)
function resizeCanvas() {
  // Canvas disesuaikan ukurannya dengan elemen <img>
  canvas.width = cameraStream.clientWidth;
  canvas.height = cameraStream.clientHeight;
}

// Load TFJS model
async function loadModel() {
  try {
    model = await tf.loadGraphModel("./mode_uji/model.json");
    console.log("Model loaded successfully.");
  } catch (err) {
    console.error("Failed to load model:", err);
    alert(
      "Gagal memuat model. Pastikan file model.json dan .bin berada di folder yang benar."
    );
  }
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
  if (!isDetecting) return; // Hentikan jika sudah tidak mendeteksi

  tf.engine().startScope();

  const input = tf.browser
    .fromPixels(cameraStream)
    .resizeBilinear([modelInputSize, modelInputSize])
    .div(255.0)
    .expandDims(0);

  const prediction = await model.execute(input);
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
    const x = x1 + w / 2;
    const y = y1 + h / 2;

    drawBox([x, y, w, h], score, label, color);
  }
  //Hapus kalo tidak mau dipakai
  const currentTime = Date.now();
  if (currentTime - lastApiCallTime > API_CALL_DELAY && results.length > 0) {
    sendData(results);
    lastApiCallTime = currentTime;
  }

  tf.engine().endScope();

  detectLoopId = requestAnimationFrame(detectFrame);
}

// Event listener untuk tombol
document.getElementById("startBtn").addEventListener("click", () => {
  if (!model) {
    console.log("Model belum siap, harap tunggu.");
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
  const startBtn = document.getElementById("startBtn");
  startBtn.textContent = "Memuat Model...";
  await setupCamera();
  await loadModel();

  if (model) {
    startBtn.disabled = false;
    startBtn.textContent = "Mulai Deteksi";
    console.log("Setup complete. Ready to start detection.");
  } else {
    startBtn.textContent = "Gagal Memuat";
    startBtn.classList.add("bg-red-500");
  }
})();
