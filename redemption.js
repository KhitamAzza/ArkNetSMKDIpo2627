// ============================================
// REDEMPTION: CONFIG HELPERS
// ============================================
function getRedemptionConfig() {
  return {
    enabled: (appConfig?.redemption_enable !== false) && (appConfig?.redemptionEnable !== false),
    maxSubmit: appConfig?.max_point_submit ?? appConfig?.maxPointSubmit ?? 1,
    maxPoint:  appConfig?.max_redemption_point  ?? appConfig?.maxRedemptionPoint  ?? 5
  };
}

// ============================================
// REDEMPTION: DOM REFS (local)
// ============================================
const redemptionSearchInput = document.getElementById("redemptionSearch");
let   redemptionAllStudents = [];
let   lastRedemptionBundle  = null;

// ============================================
// REDEMPTION: LOGIN
// ============================================
function doRedemptionLogin() {
  const cfg = getRedemptionConfig();

  if (!appConfig) {
    showStudentToast("Aplikasi masih memuat, mohon tunggu...", "info");
    return;
  }
  if (!cfg.enabled) {
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
  if (!appConfig || !getRedemptionConfig().enabled) return;
  const input = redemptionPassword.value.trim();
  if (findStaffByPassword(input)) doRedemptionLogin();
});

// ============================================
// REDEMPTION: LOAD STUDENTS (SUPABASE)
// ============================================
async function loadRedemptionStudents() {
  if (!currentRedemptionGuru) return;
  showStudentLoading(true);

  try {
    // 1. All students
    const { data: students, error: sErr } = await sb
      .from('Database')
      .select('id, nama, kelas, ekstra');
    if (sErr) throw sErr;

    // 2. Attendance this semester
    const { data: attendance, error: aErr } = await sb
      .from('Attendance')
      .select('student_id, status')
      .eq('semester', currentSemester);
    if (aErr) throw aErr;

    // 3. Redemptions this semester
    const { data: redemptions, error: rErr } = await sb
      .from('Redemptions')
      .select('student_id, poin')
      .eq('semester', currentSemester);
    if (rErr) {
      console.warn("Redemptions query failed (table may not exist yet):", rErr.message);
    }

    // 4. Aggregate minus points
    const cfg = getRedemptionConfig();
    const minusAlpha = appConfig?.nilai_minus_alpha ?? appConfig?.nilaiMinusAlpha ?? -10;
    const minusLate  = appConfig?.nilai_minus_terlambat ?? appConfig?.nilaiMinusTerlambat ?? -5;

    const attMap = {};
    (attendance || []).forEach(r => {
      if (!attMap[r.student_id]) attMap[r.student_id] = { alpha: 0, late: 0 };
      const st = (r.status || "").toUpperCase();
      if (st === "ALPHA") attMap[r.student_id].alpha++;
      if (st === "TERLAMBAT" || st === "TELAT") attMap[r.student_id].late++;
    });

    const redMap = {};
    (redemptions || []).forEach(r => {
      redMap[r.student_id] = (redMap[r.student_id] || 0) + (r.poin || 0);
    });

    const processed = (students || []).map(s => {
      const a = attMap[s.id] || { alpha: 0, late: 0 };
      const minus = (a.alpha * minusAlpha) + (a.late * minusLate);
      const plus  = redMap[s.id] || 0;
      return { ...s, point: minus + plus, minus, plus };
    });

    // Only students with negative net points
    redemptionAllStudents = processed.filter(s => s.point < 0).sort((a, b) => a.point - b.point);

    // 5. Teacher daily submission limit (Jakarta today)
    const todayStr = getJakartaDateISO();
    const { data: guruReds, error: gErr } = await sb
      .from('Redemptions')
      .select('created_at')
      .eq('guru', currentRedemptionGuru)
      .eq('semester', currentSemester);
    if (gErr) console.warn(gErr);

    const todaySubs = (guruReds || []).filter(r => {
      const d = new Date(r.created_at);
      const jkt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
      return jkt === todayStr;
    });

    const submissionCount = todaySubs.length;
    const hasReachedLimit = submissionCount >= cfg.maxSubmit;

    const bundle = {
      students: redemptionAllStudents,
      hasReachedLimit,
      submissionCount,
      maxPointSubmit: cfg.maxSubmit,
      maxRedemptionPoint: cfg.maxPoint
    };
    lastRedemptionBundle = bundle;
    renderRedemptionBundle(bundle);

  } catch (err) {
    console.error(err);
    showStudentToast("Gagal memuat data siswa", "error");
  }
  showStudentLoading(false);
}

// ============================================
// REDEMPTION: RENDER BUNDLE
// ============================================
function renderRedemptionBundle(data) {
  // Sync slider caps from live config
  if (data.maxRedemptionPoint) {
    appConfig = appConfig || {};
    appConfig.max_redemption_point = data.maxRedemptionPoint;
    appConfig.max_point_submit     = data.maxPointSubmit;
  }

  renderRedemptionBanner(data.hasReachedLimit || false);
  renderRedemptionList(
    data.students || [],
    data.hasReachedLimit || false,
    data.submissionCount || 0,
    data.maxPointSubmit || 1
  );
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
      ? `✅ Batas tercapai (${submissionCount}/${maxPointSubmit})`
      : "Tambah Poin";

    card.innerHTML = `
      <div class="redemption-card-main">
        <div class="redemption-card-info">
          <div class="redemption-card-name">${s.nama}</div>
          <div class="redemption-card-class">${s.kelas}</div>
          <div class="redemption-card-point">${s.point} poin</div>
        </div>
        <button class="redemption-card-btn" onclick="openRedemptionModal('${s.id}','${s.nama}','${s.kelas}',${s.point})" ${disabled}>
          ${btnText}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// ============================================
// REDEMPTION: SEARCH
// ============================================
function filterRedemptionList() {
  if (!redemptionSearchInput || !lastRedemptionBundle) return;
  const q = redemptionSearchInput.value.trim().toLowerCase();
  const base = redemptionAllStudents.filter(s =>
    s.nama.toLowerCase().includes(q) || s.kelas.toLowerCase().includes(q)
  );
  renderRedemptionList(
    base,
    lastRedemptionBundle.hasReachedLimit,
    lastRedemptionBundle.submissionCount,
    lastRedemptionBundle.maxPointSubmit
  );
}

if (redemptionSearchInput) {
  redemptionSearchInput.addEventListener("input", filterRedemptionList);
}

// ============================================
// REDEMPTION: MODAL
// ============================================
function openRedemptionModal(studentId, nama, kelas, point) {
  if (redemptionBanner.style.display === "block") {
    showStudentToast("Anda sudah memberi nilai hari ini", "info");
    return;
  }

  selectedRedemptionStudent = { id: studentId, nama, kelas, point };
  redemptionModalName.textContent = nama;
  redemptionModalClass.textContent = kelas + " • " + point + " poin";

  const cfg = getRedemptionConfig();
  const maxVal = cfg.maxPoint;
  redemptionSlider.max = maxVal;
  redemptionSlider.value = Math.min(3, maxVal);

  redemptionDesc.value = "";
  renderSliderMarks();
  updateSliderLabel();
  redemptionSubmitBtn.disabled = false;
  redemptionModal.classList.add("visible");
}

function closeRedemptionModal() {
  redemptionModal.classList.remove("visible");
  selectedRedemptionStudent = null;
  redemptionSubmitBtn.disabled = false;
}

function renderSliderMarks() {
  const container = document.querySelector(".redemption-slider-marks");
  if (!container) return;
  const maxVal = getRedemptionConfig().maxPoint;
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
  const cfg = getRedemptionConfig();
  const maxVal = cfg.maxPoint;

  const activeColors = REDEMPTION_PALETTE.slice(0, maxVal);
  const color = activeColors[val - 1] || REDEMPTION_PALETTE[0];

  const labels = ["Sangat mudah", "Mudah", "Cukup", "Membantu", "Sangat membantu"];
  let labelIndex;
  if (maxVal <= 5) {
    labelIndex = Math.min(val - 1, 4);
  } else {
    labelIndex = Math.min(Math.floor((val - 1) * 5 / maxVal), 4);
  }
  const label = labels[labelIndex];

  redemptionSliderLabel.innerHTML = `
    <span class="redemption-slider-number">${val}</span>
    <span class="redemption-slider-text">${label}</span>
  `;
  redemptionSliderLabel.style.color = color;

  const percent = maxVal === 1 ? 100 : ((val - 1) / (maxVal - 1)) * 100;
  redemptionSlider.style.setProperty("--slider-color", color);
  redemptionSlider.style.setProperty("--value-percent", percent + "%");
}

// ============================================
// REDEMPTION: SUBMIT (SUPABASE)
// ============================================
async function submitRedemption() {
  if (!selectedRedemptionStudent || !currentRedemptionGuru) return;

  const poin = Number(redemptionSlider.value);
  const deskripsi = redemptionDesc.value.trim();
  const cfg = getRedemptionConfig();

  if (!deskripsi) {
    showStudentToast("Deskripsi wajib diisi", "error");
    return;
  }

  redemptionSubmitBtn.disabled = true;
  showStudentLoading(true);

  try {
    // Double-check daily limit (race condition guard)
    const todayStr = getJakartaDateISO();
    const { data: guruReds, error: checkErr } = await sb
      .from('Redemptions')
      .select('created_at')
      .eq('guru', currentRedemptionGuru)
      .eq('semester', currentSemester);
    if (checkErr) throw checkErr;

    const todaySubs = (guruReds || []).filter(r => {
      const d = new Date(r.created_at);
      const jkt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
      return jkt === todayStr;
    });

    if (todaySubs.length >= cfg.maxSubmit) {
      showStudentToast("Batas pengiriman hari ini sudah tercapai", "error");
      redemptionSubmitBtn.disabled = false;
      showStudentLoading(false);
      return;
    }

    // Insert
    const { error: insertErr } = await sb.from('Redemptions').insert({
      student_id: selectedRedemptionStudent.id,
      nama: selectedRedemptionStudent.nama,
      kelas: selectedRedemptionStudent.kelas,
      poin: poin,
      deskripsi: deskripsi,
      guru: currentRedemptionGuru,
      semester: currentSemester,
      created_at: new Date().toISOString()
    });
    if (insertErr) throw insertErr;

    closeRedemptionModal();
    showStudentToast("✓ Poin penebusan berhasil dicatat", "ok");
    loadRedemptionStudents(); // refresh list + banner

  } catch (err) {
    console.error(err);
    showStudentToast("Error: " + err.message, "error");
    redemptionSubmitBtn.disabled = false;
  }

  showStudentLoading(false);
}