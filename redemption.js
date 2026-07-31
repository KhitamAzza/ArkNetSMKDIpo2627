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
      renderRedemptionBanner(data.hasSubmittedToday);
      renderRedemptionList(data.students || [], data.hasSubmittedToday);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderRedemptionBanner(hasSubmitted) {
  redemptionBanner.style.display = hasSubmitted ? "block" : "none";
}

function renderRedemptionList(students, hasSubmittedToday) {
  const container = redemptionStudentList;
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div class="admin-empty">✓ Tidak ada siswa dengan minus poin</div>`;
    return;
  }

  students.forEach(s => {
    const card = document.createElement("div");
    card.className = "redemption-card";

    const disabled = hasSubmittedToday ? "disabled" : "";

    card.innerHTML = `
      <div class="redemption-card-main">
        <div class="redemption-card-info">
          <div class="redemption-card-name">${s.nama}</div>
          <div class="redemption-card-class">${s.kelas}</div>
          <div class="redemption-card-point">${s.point} poin</div>
        </div>
        <button class="redemption-card-btn" onclick="openRedemptionModal('${s.nama}', '${s.kelas}', ${s.point})" ${disabled}>
          ${hasSubmittedToday ? "✅ Selesai" : "Tambah Poin"}
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
  redemptionSlider.value = 3;
  redemptionDesc.value = "";
  document.getElementById("redemptionCharCount").textContent = "0";
  updateSliderLabel();
  redemptionSubmitBtn.disabled = false; // ← ADD THIS
  redemptionModal.classList.add("visible");
}

function closeRedemptionModal() {
  redemptionModal.classList.remove("visible");
  selectedRedemptionStudent = null;
  redemptionSubmitBtn.disabled = false; // ← ADD THIS
}

function updateSliderLabel() {
  const val = Number(redemptionSlider.value);
  const labels = {
    1: "Sangat mudah",
    2: "Mudah",
    3: "Cukup",
    4: "Membantu",
    5: "Sangat membantu"
  };

  const colors = {
    1: "#ef4444",   // red
    2: "#f97316",   // orange
    3: "#eab308",   // yellow
    4: "#84cc16",   // lime
    5: "#10b981"    // green
  };

  const color = colors[val];
  const label = labels[val];

  redemptionSliderLabel.textContent = label;
  redemptionSliderLabel.style.color = color;

  // Update slider track fill and thumb color
  const percent = ((val - 1) / 4) * 100;
  redemptionSlider.style.setProperty("--slider-color", color);
  redemptionSlider.style.setProperty("--value-percent", percent + "%");
}

redemptionDesc.addEventListener("input", () => {
  document.getElementById("redemptionCharCount").textContent = redemptionDesc.value.length;
});

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