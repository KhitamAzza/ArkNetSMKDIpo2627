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

// Asia/Jakarta has a fixed UTC+7 offset (no DST), so this is a safe way to get
// the UTC bounds of "today" in Jakarta for querying created_at columns.
function getJakartaDayBoundsUTC() {
  const todayStr = getJakartaDateISO(); // "YYYY-MM-DD"
  const startUTC = new Date(todayStr + "T00:00:00+07:00");
  const endUTC   = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
  return { startISO: startUTC.toISOString(), endISO: endUTC.toISOString() };
}

// ============================================
// REDEMPTION: STATE
// ============================================
// Lightweight roster for autocomplete only — id/nama/kelas/ekstra, no
// attendance or redemption history. That heavier data is fetched per student,
// only once a name is actually picked.
let redemptionStudentIndex = [];
let redemptionLimitReached = false;
let redemptionModalMaxPoint = 1; // per-student cap: never lets a submit push the score past 0

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

  initRedemptionSession();
}

redemptionPassword.addEventListener("input", () => {
  if (!appConfig || !getRedemptionConfig().enabled) return;
  const input = redemptionPassword.value.trim();
  if (findStaffByPassword(input)) doRedemptionLogin();
});

// ============================================
// REDEMPTION: SESSION INIT (limit check, then either the "habis" panel
// or the search UI — never both)
// ============================================
async function initRedemptionSession() {
  if (!currentRedemptionGuru) return;
  showStudentLoading(true);

  resetRedemptionUI(true /* keep the cached roster, just clear search/detail */);

  try {
    const status = await checkTeacherSubmissionStatus();
    redemptionLimitReached = status.reached;

    if (status.reached) {
      redemptionSearchArea.style.display = "none";
      redemptionLimitSub.textContent = `${status.count}/${status.max} nilai terkirim hari ini`;
      redemptionLimitPanel.style.display = "flex";
    } else {
      redemptionLimitPanel.style.display = "none";
      redemptionSearchArea.style.display = "flex";
      redemptionHeroSub.textContent = `Kesempatan tersisa hari ini: ${status.max - status.count}/${status.max}`;

      if (redemptionStudentIndex.length === 0) {
        const { data, error } = await sb.from('Database').select('id, nama, kelas, ekstra');
        if (error) throw error;
        redemptionStudentIndex = data || [];
      }
    }
  } catch (err) {
    console.error(err);
    showStudentToast("Gagal memuat data", "error");
  }

  showStudentLoading(false);
}

async function checkTeacherSubmissionStatus() {
  const cfg = getRedemptionConfig();
  const { startISO, endISO } = getJakartaDayBoundsUTC();

  const { data: guruReds, error } = await sb
    .from('Redemptions')
    .select('created_at')
    .eq('guru', currentRedemptionGuru)
    .eq('semester', currentSemester)
    .gte('created_at', startISO)
    .lt('created_at', endISO);
  if (error) throw error;

  const count = (guruReds || []).length;
  return { reached: count >= cfg.maxSubmit, count, max: cfg.maxSubmit };
}

// ============================================
// REDEMPTION: SEARCH / AUTOCOMPLETE (client-side, against the light roster)
// ============================================
redemptionSearch.addEventListener("input", () => {
  const q = redemptionSearch.value.trim().toLowerCase();
  redemptionDetail.style.display = "none";
  redemptionEmpty.style.display = "flex";
  selectedRedemptionStudent = null;

  if (!q || q.length < 2) {
    redemptionSuggestions.style.display = "none";
    return;
  }

  const matches = redemptionStudentIndex
    .filter(s => s.nama.toLowerCase().includes(q))
    .slice(0, 6);
  renderRedemptionSuggestions(matches);
});

function renderRedemptionSuggestions(matches) {
  redemptionSuggestions.innerHTML = "";
  if (matches.length === 0) {
    redemptionSuggestions.style.display = "none";
    return;
  }
  matches.forEach(s => {
    const div = document.createElement("div");
    div.className = "redemption-suggestion-item";
    div.innerHTML = `<div class="redemption-suggestion-name">${s.nama}</div><div class="redemption-suggestion-class">${s.kelas}</div>`;
    div.onclick = () => selectRedemptionStudent(s);
    redemptionSuggestions.appendChild(div);
  });
  redemptionSuggestions.style.display = "block";
}

document.addEventListener("click", (e) => {
  if (redemptionSuggestions && !e.target.closest(".redemption-search-wrap")) {
    redemptionSuggestions.style.display = "none";
  }
});

// ============================================
// REDEMPTION: PER-STUDENT LOOKUP (fetched only once a name is picked)
// ============================================
// Computes a student's current point balance fresh from Supabase. Shared by
// selectRedemptionStudent (initial load) and submitRedemption (race-condition
// re-check right before inserting), so the two never drift out of sync.
async function computeStudentPoint(studentId) {
  const [{ data: attRows, error: attErr }, { data: reds, error: redErr }] = await Promise.all([
    sb.from('AttendanceV2').select('date, status').eq('student_id', studentId).eq('semester', currentSemester),
    sb.from('Redemptions').select('poin').eq('student_id', studentId).eq('semester', currentSemester)
  ]);
  if (attErr) throw attErr;
  if (redErr) throw redErr;

  const byDate = {};
  (attRows || []).forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  const stats = { HADIR: 0, ALPHA: 0, TERLAMBAT: 0, PAGI: 0, TELAT: 0 };
  Object.values(byDate).forEach(rows => {
    const st = (deriveStatus(rows) || "-").toUpperCase();
    if (stats[st] !== undefined) stats[st]++;
  });

  const minusAlpha = appConfig?.nilai_minus_alpha ?? -10;
  const minusLate  = appConfig?.nilai_minus_terlambat ?? -5;
  const alphaCount = stats.ALPHA;
  const lateCount  = stats.TERLAMBAT + stats.TELAT + stats.PAGI; // PAGI counts as late, same as student/teacher dashboards
  const totalMinus = (alphaCount * minusAlpha) + (lateCount * minusLate);
  const redemptionTotal = (reds || []).reduce((sum, r) => sum + (r.poin || 0), 0);
  const point = totalMinus + redemptionTotal;

  return { point, hadir: stats.HADIR, alpha: alphaCount, late: lateCount };
}

async function selectRedemptionStudent(student) {
  redemptionSearch.value = student.nama;
  redemptionSuggestions.style.display = "none";
  showStudentLoading(true);

  try {
    const { point, hadir, alpha, late } = await computeStudentPoint(student.id);

    selectedRedemptionStudent = { id: student.id, nama: student.nama, kelas: student.kelas, point };

    redemptionEmpty.style.display = "none";
    renderRedemptionDetail({
      nama: student.nama,
      kelas: student.kelas,
      ekstra: student.ekstra,
      hadir,
      alpha,
      late,
      point
    });
  } catch (err) {
    console.error(err);
    showStudentToast("Gagal memuat data siswa", "error");
  }

  showStudentLoading(false);
}

function getInitials(name) {
  return (name || "").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function renderRedemptionDetail(d) {
  const isMinus = d.point < 0;
  redemptionDetail.innerHTML = `
    <div class="redemption-detail-card ${isMinus ? "is-minus" : ""}">
      <div class="redemption-detail-avatar ${isMinus ? "is-minus" : ""}">${getInitials(d.nama)}</div>
      <div class="redemption-detail-name">${d.nama}</div>
      <div class="redemption-detail-class">${d.kelas}${d.ekstra ? " • " + d.ekstra : ""}</div>

      <div class="redemption-detail-stats">
        <div class="redemption-stat">
          <div class="redemption-stat-val">${d.hadir}</div>
          <div class="redemption-stat-label">Hadir</div>
        </div>
        <div class="redemption-stat">
          <div class="redemption-stat-val">${d.alpha}</div>
          <div class="redemption-stat-label">Alpha</div>
        </div>
        <div class="redemption-stat">
          <div class="redemption-stat-val">${d.late}</div>
          <div class="redemption-stat-label">Terlambat</div>
        </div>
      </div>

      <div class="redemption-detail-point ${isMinus ? "is-minus" : ""}">
        <div class="redemption-detail-point-val">${d.point}</div>
        <div class="redemption-detail-point-label">Sisa Poin</div>
      </div>

      ${isMinus
        ? `<button class="btn-start" onclick="openRedemptionModalFromDetail()">Tambah Poin</button>`
        : `<div class="redemption-detail-ok">✓ Siswa ini tidak memiliki minus poin</div>`
      }
    </div>
  `;
  redemptionDetail.style.display = "block";
}

// ============================================
// REDEMPTION: MODAL
// ============================================
function openRedemptionModalFromDetail() {
  if (!selectedRedemptionStudent) return;
  openRedemptionModal(selectedRedemptionStudent.id, selectedRedemptionStudent.nama, selectedRedemptionStudent.kelas, selectedRedemptionStudent.point);
}

function openRedemptionModal(studentId, nama, kelas, point) {
  if (redemptionLimitReached) {
    showStudentToast("Kesempatan memberi poin anda sudah habis", "info");
    return;
  }
  if (point >= 0) {
    showStudentToast("Siswa ini tidak memiliki minus poin", "info");
    return;
  }

  selectedRedemptionStudent = { id: studentId, nama, kelas, point };
  redemptionModalName.textContent = nama;
  redemptionModalClass.textContent = kelas + " • " + point + " poin";

  const cfg = getRedemptionConfig();
  // Never let a teacher push a student's score past 0 — cap the slider at
  // however much minus the student actually has left, or the configured
  // max, whichever is smaller.
  redemptionModalMaxPoint = Math.min(cfg.maxPoint, Math.abs(point));
  const maxVal = redemptionModalMaxPoint;
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
  redemptionSubmitBtn.disabled = false;
}

function renderSliderMarks() {
  const container = document.querySelector(".redemption-slider-marks");
  if (!container) return;
  const maxVal = redemptionModalMaxPoint;
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
  const maxVal = redemptionModalMaxPoint;

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

  if (!deskripsi) {
    showStudentToast("Deskripsi wajib diisi", "error");
    return;
  }

  redemptionSubmitBtn.disabled = true;
  showStudentLoading(true);

  try {
    // Race condition guard: re-check both the daily submit limit and the
    // student's current minus balance right before inserting — either could
    // have changed since the modal was opened (e.g. another teacher just
    // gave this student points too).
    const status = await checkTeacherSubmissionStatus();
    if (status.reached) {
      showStudentToast("Batas pengiriman hari ini sudah tercapai", "error");
      closeRedemptionModal();
      redemptionLimitReached = true;
      await initRedemptionSession();
      return;
    }

    const { point: freshPoint } = await computeStudentPoint(selectedRedemptionStudent.id);
    if (freshPoint >= 0) {
      showStudentToast("Siswa ini sudah tidak memiliki minus poin", "error");
      closeRedemptionModal();
      return;
    }
    if (poin > Math.abs(freshPoint)) {
      showStudentToast(`Poin melebihi sisa minus siswa (maks ${Math.abs(freshPoint)})`, "error");
      redemptionSubmitBtn.disabled = false;
      showStudentLoading(false);
      return;
    }

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
    await initRedemptionSession(); // re-checks the limit; shows the "habis" panel if this was the last one

  } catch (err) {
    console.error(err);
    showStudentToast("Error: " + err.message, "error");
    redemptionSubmitBtn.disabled = false;
    showStudentLoading(false);
  }
}

// ============================================
// REDEMPTION: RESET (called on back-to-landing and at the start of each session)
// ============================================
function resetRedemptionUI(keepIndex) {
  if (redemptionSearch) redemptionSearch.value = "";
  if (redemptionSuggestions) { redemptionSuggestions.innerHTML = ""; redemptionSuggestions.style.display = "none"; }
  if (redemptionDetail) { redemptionDetail.innerHTML = ""; redemptionDetail.style.display = "none"; }
  if (redemptionEmpty) redemptionEmpty.style.display = "flex";
  if (redemptionLimitPanel) redemptionLimitPanel.style.display = "none";
  if (redemptionSearchArea) redemptionSearchArea.style.display = "none";
  selectedRedemptionStudent = null;
  redemptionLimitReached = false;
  if (!keepIndex) redemptionStudentIndex = [];
}