// ============================================
// REDEMPTION: LOGIN
// ============================================
function doRedemptionLogin() {
  // GUARD: redemption disabled by admin
  if (!appConfig) {
    showStudentToast("Aplikasi masih memuat, mohon tunggu...", "info");
    return;
  }
  if (appConfig.redemptionEnable === false) {
    showStudentToast("Fitur poin penebusan sedang dinonaktifkan", "error");
    return;
  }

  const input = redemptionPassword.value.trim();
  if (!input) {
    showStudentToast("Password wajib diisi", "error");
    return;
  }

  const staff = findStaffByPassword(input);
  if (!staff) {
    showStudentToast("Password salah", "error");
    redemptionPassword.value = "";
    redemptionPassword.focus();
    return;
  }

  currentRedemptionGuru = staff.nama;
  redemptionLoginScreen.style.display = "none";
  redemptionScreen.style.display = "flex";
  redemptionHeaderName.textContent = staff.nama;

  loadRedemptionStudents();
}

redemptionPassword.addEventListener("input", () => {
  // GUARD: block auto-login too if redemption is disabled
  if (!appConfig || appConfig.redemptionEnable === false) return;

  const input = redemptionPassword.value.trim();
  if (findStaffByPassword(input)) {
    doRedemptionLogin();
  }
});

// ============================================
// REDEMPTION: LOAD STUDENTS
// ============================================
async function loadRedemptionStudents() {
  if (!currentRedemptionGuru) return;
  showStudentLoading(true);

  try {
    const res = await fetch(API_URL + "?action=getRedemptionStudents&guru=" + encodeURIComponent(currentRedemptionGuru));
    const data = await res.json();

    if (data.status === "ok") {
      redemptionAllStudents = data.students || [];   // ← cache
      const hasReachedLimit = data.hasReachedLimit || false;
      renderRedemptionBanner(hasReachedLimit);
      renderRedemptionList(redemptionAllStudents, hasReachedLimit, data.submissionCount, data.maxPointSubmit);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}
// Filter locally without hitting the server again
function filterRedemptionList(query) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? redemptionAllStudents.filter(s => s.nama.toLowerCase().includes(q))
    : redemptionAllStudents;

  // Re-use the same limit state from the last load
  const banner = document.getElementById("redemptionBanner");
  const hasReachedLimit = banner && banner.style.display === "block";
  const countEl = document.getElementById("redemptionCountBadge"); // optional counter
  const maxVal = appConfig?.maxPointSubmit || 1;

  renderRedemptionList(filtered, hasReachedLimit, countEl ? countEl.dataset.count : 0, maxVal);
}

function renderRedemptionBanner(hasReachedLimit) {
  redemptionBanner.style.display = hasReachedLimit ? "block" : "none";
}

function renderRedemptionList(students, hasReachedLimit, submissionCount, maxPointSubmit) {
  const container = redemptionStudentList;
  container.innerHTML = "";

  if (students.length === 0) {
    const searchVal = redemptionSearchInput?.value.trim();
    const msg = searchVal
      ? `Tidak ada siswa bernama “${searchVal}”`
      : "✓ Tidak ada siswa dengan minus poin";
    container.innerHTML = `<div class="admin-empty">${msg}</div>`;
    return;
  }

  students.forEach(s => {
    const card = document.createElement("div");
    card.className = "redemption-card";

    const disabled = hasReachedLimit ? "disabled" : "";
    const btnText = hasReachedLimit
      ? `✅ Batas tercapai (${submissionCount || 0}/${maxPointSubmit || 1})`
      : "Tambah Poin";

    card.innerHTML = `
      <div class="redemption-card-main">
        <div class="redemption-card-info">
          <div class="redemption-card-name">${s.nama}</div>
          <div class="redemption-card-class">${s.kelas}</div>
          <div class="redemption-card-point">${s.point} poin</div>
        </div>
        <button class="redemption-card-btn" onclick="openRedemptionModal('${s.nama}', '${s.kelas}', ${s.point})" ${disabled}>
          ${btnText}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ============================================
// REDEMPTION: MODAL
// ============================================
function openRedemptionModal(nama, kelas, point) {
  if (document.getElementById("redemptionBanner").style.display === "block") {
    showStudentToast("Anda sudah memberi nilai hari ini", "info");
    return;
  }

  selectedRedemptionStudent = { nama, kelas, point };
  redemptionModalName.textContent = nama;
  redemptionModalClass.textContent = kelas + " • " + point + " poin";

  const maxVal = appConfig?.maxRedemptionPoint || 5;
  redemptionSlider.max = maxVal;
  redemptionSlider.value = Math.min(3, maxVal);

  redemptionDesc.value = "";
  
  renderSliderMarks();   // ← build bottom numbers dynamically
  updateSliderLabel();
  redemptionSubmitBtn.disabled = false;
  redemptionModal.classList.add("visible");
}

function closeRedemptionModal() {
  redemptionModal.classList.remove("visible");
  selectedRedemptionStudent = null;
  redemptionSubmitBtn.disabled = false; // ← ADD THIS
}

function renderSliderMarks() {
  const container = document.querySelector(".redemption-slider-marks");
  if (!container) return;

  const maxVal = appConfig?.maxRedemptionPoint || 5;
  container.innerHTML = "";

  for (let i = 1; i <= maxVal; i++) {
    const span = document.createElement("span");
    span.textContent = i;
    container.appendChild(span);
  }
}

const REDEMPTION_PALETTE = [
  "#0C7114", "#177D1A", "#239921", "#2FB528", "#45CA3F",
  "#66D95F", "#88E680", "#ADEFA6", "#D3F7CF", "#F5FDF4"
];

function updateSliderLabel() {
  const val = Number(redemptionSlider.value);
  const maxVal = appConfig?.maxRedemptionPoint || 5;

  // Color from palette (slice to max length)
  const activeColors = REDEMPTION_PALETTE.slice(0, maxVal);
  const color = activeColors[val - 1] || REDEMPTION_PALETTE[0];

  // 5 text labels
  const labels = ["Sangat mudah", "Mudah", "Cukup", "Membantu", "Sangat membantu"];

  let labelIndex;
  if (maxVal <= 5) {
    // 1-to-1 mapping: value 1→label 0, value 2→label 1, etc.
    labelIndex = Math.min(val - 1, 4);
  } else {
    // Spread 5 labels evenly across the bigger range
    // max=10 → 2 values per label
    // max=7  → distributes as 2,1,2,1,1
    labelIndex = Math.min(Math.floor((val - 1) * 5 / maxVal), 4);
  }

  const label = labels[labelIndex];

  redemptionSliderLabel.innerHTML = `
    <span class="redemption-slider-number">${val}</span>
    <span class="redemption-slider-text">${label}</span>
  `;
  redemptionSliderLabel.style.color = color;

  // Track fill
  const percent = maxVal === 1 ? 100 : ((val - 1) / (maxVal - 1)) * 100;
  redemptionSlider.style.setProperty("--slider-color", color);
  redemptionSlider.style.setProperty("--value-percent", percent + "%");
}
// ============================================
// REDEMPTION: SUBMIT
// ============================================
async function submitRedemption() {
  if (!selectedRedemptionStudent || !currentRedemptionGuru) return;

  const poin = Number(redemptionSlider.value);
  const deskripsi = redemptionDesc.value.trim();

  if (!deskripsi) {
    showStudentToast("Deskripsi wajib diisi", "error");
    return;
  }

  redemptionSubmitBtn.disabled = true;
  showStudentLoading(true);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "submitRedemption",
        nama: selectedRedemptionStudent.nama,
        kelas: selectedRedemptionStudent.kelas,
        poin: poin,
        deskripsi: deskripsi,
        guru: currentRedemptionGuru
      })
    });

    const data = await res.json();
    if (data.status === "ok") {
      closeRedemptionModal();
      showStudentToast("✓ " + data.message, "ok");
      loadRedemptionStudents(); // Refresh list + banner
    } else {
      showStudentToast(data.message || "Gagal menyimpan", "error");
      redemptionSubmitBtn.disabled = false;
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
    redemptionSubmitBtn.disabled = false;
  }

  showStudentLoading(false);
}
// Search box listener
const redemptionSearchInput = document.getElementById("redemptionSearch");
if (redemptionSearchInput) {
  redemptionSearchInput.addEventListener("input", (e) => {
    filterRedemptionList(e.target.value);
  });
}
