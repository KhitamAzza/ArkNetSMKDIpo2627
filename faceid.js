// ============================================
// faceid.js — Student Face ID Lookup
// Identifies a face against the master database
// ============================================

const FACEID_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const FACEID_CONFIRM_FRAMES = 3;
const FACEID_THRESHOLD = 0.6;
const FACEID_DEBOUNCE_MS = 3000;

let faceIdDescriptors = [];
let faceIdModelsLoaded = false;
let faceIdVideoStream = null;
let faceIdInterval = null;
let faceIdScanning = false;
let faceIdPopupOpen = false;
let faceIdPendingConfirm = new Map(); // nama -> count
let faceIdLastDetected = new Map();   // nama -> timestamp

function getFaceIdRefs() {
  return {
    screen: document.getElementById("faceIdScreen"),
    video: document.getElementById("faceIdVideo"),
    canvas: document.getElementById("faceIdCanvas"),
    popup: document.getElementById("faceIdPopup"),
    popupName: document.getElementById("faceIdPopupName"),
    popupClass: document.getElementById("faceIdPopupClass"),
    popupEkstra: document.getElementById("faceIdPopupEkstra"),
    bottomHint: document.getElementById("faceIdBottomHint"),
    loading: document.getElementById("faceIdLoading"),
    loadingText: document.getElementById("faceIdLoadingText")
  };
}

// ===== ENTRY / EXIT =====
function showFaceIdScreen() {
  const refs = getFaceIdRefs();
  if (!refs.screen) {
    showStudentToast("Fitur tidak tersedia", "error");
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showStudentToast("Browser tidak mendukung kamera", "error");
    return;
  }
  document.getElementById("landingScreen").style.display = "none";
  refs.screen.style.display = "flex";
  faceIdPopupOpen = false;
  initFaceId();
}

function hideFaceIdScreen() {
  const refs = getFaceIdRefs();
  stopFaceIdCamera();
  if (refs.screen) refs.screen.style.display = "none";
  faceIdScanning = false;
  faceIdPopupOpen = false;
}

function backToLandingFromFaceId() {
  hideFaceIdScreen();
  document.getElementById("landingScreen").style.display = "flex";
}

// ===== INIT =====
async function initFaceId() {
  const refs = getFaceIdRefs();
  showFaceIdLoading(true, "Memuat model pengenalan wajah...");

  // 1. Models
  if (!faceIdModelsLoaded) {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACEID_MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(FACEID_MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(FACEID_MODEL_URL);
      faceIdModelsLoaded = true;
    } catch (err) {
      showFaceIdLoading(true, "Gagal memuat model: " + err.message);
      return;
    }
  }

  // 2. Load master face database
  showFaceIdLoading(true, "Memuat data wajah...");
  try {
    const res = await fetch(API_URL + "?action=getFaceDatabase&ekstra=MASTER");
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.message || "Gagal memuat data wajah");

    faceIdDescriptors = [];
    (data.students || []).forEach(s => {
      if (s.faceId && Array.isArray(s.faceId) && s.faceId.length === 128) {
        faceIdDescriptors.push({
          nama: s.nama,
          kelas: s.kelas,
          ekstra: s.ekstra,
          descriptor: s.faceId
        });
      }
    });
  } catch (err) {
    showFaceIdLoading(true, "Gagal memuat wajah: " + err.message);
    return;
  }

  // 3. Start camera (front only)
  hideFaceIdLoading();
  await startFaceIdCamera();
  faceIdScanning = true;
  updateFaceIdBottomHint("Arahkan wajah ke kamera");
}

// ===== CAMERA (front / user only) =====
async function startFaceIdCamera() {
  const refs = getFaceIdRefs();
  try {
    const constraints = {
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
    faceIdVideoStream = await navigator.mediaDevices.getUserMedia(constraints);
    refs.video.srcObject = faceIdVideoStream;
    refs.video.onloadedmetadata = () => {
      refs.video.play();
      startFaceIdDetection();
    };
  } catch (err) {
    showStudentToast("Tidak dapat mengakses kamera: " + err.message, "error");
    backToLandingFromFaceId();
  }
}

function stopFaceIdCamera() {
  if (faceIdInterval) { clearInterval(faceIdInterval); faceIdInterval = null; }
  if (faceIdVideoStream) { faceIdVideoStream.getTracks().forEach(t => t.stop()); faceIdVideoStream = null; }
  const refs = getFaceIdRefs();
  if (refs.video) { refs.video.srcObject = null; refs.video.onloadedmetadata = null; }
  if (refs.canvas) {
    const ctx = refs.canvas.getContext("2d");
    ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
  }
}

// ===== DETECTION LOOP =====
function startFaceIdDetection() {
  const refs = getFaceIdRefs();
  const video = refs.video;
  const canvas = refs.canvas;
  const ctx = canvas.getContext("2d");

  faceIdInterval = setInterval(async () => {
    if (!faceIdScanning || faceIdPopupOpen || video.paused || video.ended) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    const detections = await faceapi.detectAllFaces(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 })
    ).withFaceLandmarks().withFaceDescriptors();

    const resized = faceapi.resizeResults(detections, displaySize);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();
    const confirmedThisFrame = new Set();

    if (resized.length === 0) {
      faceIdPendingConfirm.clear();
      return;
    }

    for (const det of resized) {
      const box = det.detection.box;
      const liveDesc = Array.from(det.descriptor);

      let bestMatch = null;
      let bestDist = Infinity;

      for (const stored of faceIdDescriptors) {
        const dist = euclideanDistanceFaceId(liveDesc, stored.descriptor);
        if (dist < bestDist) { bestDist = dist; bestMatch = stored; }
      }

      let color = "#ef4444";

      if (faceIdDescriptors.length === 0) {
        color = "#f59e0b";
        updateFaceIdBottomHint("Database wajah kosong");
      } else if (bestMatch && bestDist < FACEID_THRESHOLD) {
        const nama = bestMatch.nama;
        confirmedThisFrame.add(nama);

        const lastSeen = faceIdLastDetected.get(nama);
        if (lastSeen && (now - lastSeen < FACEID_DEBOUNCE_MS)) {
          color = "#10b981";
          drawFaceIdReticle(ctx, box, color, null);
          continue;
        }

        const pending = faceIdPendingConfirm.get(nama);
        let count = 1;
        if (pending) count = pending + 1;
        faceIdPendingConfirm.set(nama, count);

        if (count < FACEID_CONFIRM_FRAMES) {
          color = "#f59e0b";
          updateFaceIdBottomHint("Tahan jangan bergerak... " + count + "/" + FACEID_CONFIRM_FRAMES);
          drawFaceIdReticle(ctx, box, color, count);
        } else {
          color = "#10b981";
          faceIdLastDetected.set(nama, now);
          faceIdPendingConfirm.delete(nama);
          drawFaceIdReticle(ctx, box, color, null);
          showFaceIdPopup(bestMatch);
          return;
        }
      } else {
        updateFaceIdBottomHint("Wajah tidak dikenali");
      }

      drawFaceIdReticle(ctx, box, color, null);
    }

    for (const [nama] of faceIdPendingConfirm) {
      if (!confirmedThisFrame.has(nama)) faceIdPendingConfirm.delete(nama);
    }
  }, 400);
}

function euclideanDistanceFaceId(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// ===== RETICLE: crosshair + outside badge =====
function drawFaceIdReticle(ctx, box, color, count) {
  const { x, y, width: w, height: h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const inset = 6;
  const ext = 10;
  const arm = Math.min(w, h) * 0.22;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;

  // Corner brackets
  const corners = [
    [x - ext, y + inset, x + arm, y + inset, x + inset, y - ext, x + inset, y + arm],
    [x + w + ext, y + inset, x + w - arm, y + inset, x + w - inset, y - ext, x + w - inset, y + arm],
    [x - ext, y + h - inset, x + arm, y + h - inset, x + inset, y + h + ext, x + inset, y + h - arm],
    [x + w + ext, y + h - inset, x + w - arm, y + h - inset, x + w - inset, y + h + ext, x + w - inset, y + h - arm]
  ];
  corners.forEach(c => {
    ctx.beginPath();
    ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]);
    ctx.moveTo(c[4], c[5]); ctx.lineTo(c[6], c[7]);
    ctx.stroke();
  });

  // Center cross (+) with gap
  const crossLen = Math.min(w, h) * 0.14;
  const gap = 5;
  ctx.beginPath();
  ctx.moveTo(cx - crossLen, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + crossLen, cy);
  ctx.moveTo(cx, cy - crossLen); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + crossLen);
  ctx.stroke();

  // Count badge above box
  if (count !== null) {
    const badgeR = 16;
    const badgeY = y - 28;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, y - 4);
    ctx.lineTo(cx, badgeY + badgeR);
    ctx.stroke();

    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(cx, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 1;
    ctx.fillText(String(count), cx, badgeY);
  }
  ctx.restore();
}

// ===== POPUP =====
function showFaceIdPopup(student) {
  faceIdPopupOpen = true;
  const refs = getFaceIdRefs();
  refs.popupName.textContent = student.nama;
  refs.popupClass.textContent = student.kelas;
  refs.popupEkstra.textContent = student.ekstra || "-";
  refs.popup.classList.add("visible");

  if (faceIdInterval) { clearInterval(faceIdInterval); faceIdInterval = null; }
  const ctx = refs.canvas.getContext("2d");
  ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
}

function closeFaceIdPopup() {
  const refs = getFaceIdRefs();
  refs.popup.classList.remove("visible");
  faceIdPopupOpen = false;
  faceIdPendingConfirm.clear();
  if (!faceIdInterval && faceIdScanning) startFaceIdDetection();
}

function rescanFaceId() {
  closeFaceIdPopup();
  faceIdLastDetected.clear();
  updateFaceIdBottomHint("Arahkan wajah ke kamera");
}

function updateFaceIdBottomHint(text) {
  const el = document.getElementById("faceIdBottomHint");
  if (el) el.textContent = text;
}

// ===== LOADING =====
function showFaceIdLoading(show, text) {
  const loading = document.getElementById("faceIdLoading");
  const txt = document.getElementById("faceIdLoadingText");
  if (loading) loading.style.display = show ? "flex" : "none";
  if (txt) txt.textContent = text || "Memuat...";
}

function hideFaceIdLoading() {
  showFaceIdLoading(false);
}