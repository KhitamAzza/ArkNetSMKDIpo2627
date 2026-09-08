// ============================================
// VALIDASI BOARD: DOM REFS (self-contained — does not touch core.js)
// ============================================
const validasiBoardScreen = document.getElementById("validasiBoardScreen");
const validasiSearch      = document.getElementById("validasiSearch");
const validasiSuggestions = document.getElementById("validasiSuggestions");
const validasiEmpty       = document.getElementById("validasiEmpty");
const validasiResult      = document.getElementById("validasiResult");

// ============================================
// VALIDASI BOARD: STATE
// ============================================
// Lightweight roster for autocomplete only — id/nama/kelas, no attendance,
// registration, redemption or denda data. That's fetched only for the one
// kelas or one student actually picked, same pattern as the redemption search.
let validasiIndex = [];
let validasiKelasList = [];

// The 4 requirements that together mean "siap validasi" — same rule the
// teacher dashboard already uses (regStatus accepted + syarat + no debt + point ok).
function buildRequirements(regStatus, hasSyaratIssue, hasDebt, hasMinusPoint) {
  return [
    { key: "ekskul", label: "Ekskul", ok: regStatus === "accepted" },
    { key: "syarat", label: "Syarat", ok: !hasSyaratIssue },
    { key: "denda",  label: "Denda",  ok: !hasDebt },
    { key: "poin",   label: "Poin",   ok: !hasMinusPoint }
  ];
}

function groupByKey(rows, key) {
  const map = {};
  (rows || []).forEach(r => {
    const k = r[key];
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return map;
}

// ============================================
// VALIDASI BOARD: OPEN / CLOSE
// ============================================
async function showValidasiBoard() {
  if (!appConfig) {
    showStudentToast("Aplikasi masih memuat, mohon tunggu...", "info");
    return;
  }

  landingScreen.style.display = "none";
  validasiBoardScreen.style.display = "flex";
  resetValidasiUI();

  await ensureValidasiIndex();
}

function backToLandingFromValidasi() {
  validasiBoardScreen.style.display = "none";
  landingScreen.style.display = "flex";
  resetValidasiUI();
  validasiIndex = [];
  validasiKelasList = [];
}

function resetValidasiUI() {
  if (validasiSearch) validasiSearch.value = "";
  if (validasiSuggestions) { validasiSuggestions.innerHTML = ""; validasiSuggestions.style.display = "none"; }
  if (validasiResult) { validasiResult.innerHTML = ""; validasiResult.style.display = "none"; }
  if (validasiEmpty) validasiEmpty.style.display = "flex";
}

// ============================================
// VALIDASI BOARD: LIGHT ROSTER (id/nama/kelas only, cached for the session)
// ============================================
async function ensureValidasiIndex() {
  if (validasiIndex.length > 0) return;
  showStudentLoading(true);

  try {
    const { data, error } = await sb.from('Database').select('id, nama, kelas');
    if (error) throw error;
    validasiIndex = data || [];
    validasiKelasList = [...new Set(validasiIndex.map(s => s.kelas))];
  } catch (err) {
    console.error(err);
    showStudentToast("Gagal memuat daftar siswa", "error");
  }

  showStudentLoading(false);
}

// ============================================
// VALIDASI BOARD: SEARCH / AUTOCOMPLETE (client-side, against the light roster)
// ============================================
validasiSearch.addEventListener("input", () => {
  const q = validasiSearch.value.trim().toLowerCase();
  validasiResult.style.display = "none";
  validasiEmpty.style.display = "flex";

  if (!q || q.length < 2) {
    validasiSuggestions.style.display = "none";
    return;
  }

  const kelasMatches = validasiKelasList.filter(k => k.toLowerCase().includes(q)).slice(0, 4);
  const studentMatches = validasiIndex.filter(s => s.nama.toLowerCase().includes(q)).slice(0, 6);
  renderValidasiSuggestions(kelasMatches, studentMatches);
});

function renderValidasiSuggestions(kelasMatches, studentMatches) {
  if (kelasMatches.length === 0 && studentMatches.length === 0) {
    validasiSuggestions.innerHTML = "";
    validasiSuggestions.style.display = "none";
    return;
  }

  let html = "";
  kelasMatches.forEach(k => {
    const count = validasiIndex.filter(s => s.kelas === k).length;
    html += `
      <div class="validasi-suggestion-item kelas" onclick="validasiSelectKelas('${k.replace(/'/g, "\\'")}')">
        <div class="validasi-suggestion-icon">🏫</div>
        <div class="validasi-suggestion-text">
          <div class="validasi-suggestion-name">${k}</div>
          <div class="validasi-suggestion-sub">${count} siswa</div>
        </div>
      </div>
    `;
  });
  studentMatches.forEach(s => {
    html += `
      <div class="validasi-suggestion-item" onclick="validasiSelectStudent('${s.id}')">
        <div class="validasi-suggestion-icon">🎓</div>
        <div class="validasi-suggestion-text">
          <div class="validasi-suggestion-name">${s.nama}</div>
          <div class="validasi-suggestion-sub">${s.kelas}</div>
        </div>
      </div>
    `;
  });

  validasiSuggestions.innerHTML = html;
  validasiSuggestions.style.display = "block";
}

document.addEventListener("click", (e) => {
  if (validasiSuggestions && !e.target.closest(".validasi-search-wrap")) {
    validasiSuggestions.style.display = "none";
  }
});

// ============================================
// VALIDASI BOARD: ON-DEMAND LOOKUP (only fetched once picked)
// ============================================
async function validasiSelectKelas(kelas) {
  validasiSearch.value = kelas;
  validasiSuggestions.style.display = "none";
  showStudentLoading(true);

  try {
    const ids = validasiIndex.filter(s => s.kelas === kelas).map(s => s.id);
    const computed = await fetchAndComputeValidasi({ ids });
    computed.sort((a, b) => b.score - a.score || a.nama.localeCompare(b.nama));
    renderValidasiKelasResult(kelas, computed);
  } catch (err) {
    console.error(err);
    showStudentToast("Gagal memuat data kelas", "error");
  }

  showStudentLoading(false);
}

async function validasiSelectStudent(id) {
  const student = validasiIndex.find(s => s.id === id);
  if (!student) return;
  validasiSearch.value = student.nama;
  validasiSuggestions.style.display = "none";
  showStudentLoading(true);

  try {
    const computed = await fetchAndComputeValidasi({ ids: [id] });
    if (computed[0]) renderValidasiStudentResult(computed[0]);
  } catch (err) {
    console.error(err);
    showStudentToast("Gagal memuat data siswa", "error");
  }

  showStudentLoading(false);
}

// Fetches Database rows + attendance/registrations/redemptions/payments scoped
// to just the given student ids (one class or one student), never the whole school.
async function fetchAndComputeValidasi({ ids }) {
  const { data: students, error: sErr } = await sb
    .from('Database')
    .select('id, nama, kelas, ekstra, syarat_khusus')
    .in('id', ids);
  if (sErr) throw sErr;

  const [
    { data: attendance, error: attErr },
    { data: registrations, error: regErr },
    { data: redemptions, error: redErr },
    { data: payments, error: payErr }
  ] = await Promise.all([
    sb.from('AttendanceV2').select('student_id, status, date').eq('semester', currentSemester).in('student_id', ids),
    sb.from('registrations').select('student_id, status, ekstra, created_at').in('student_id', ids),
    sb.from('Redemptions').select('student_id, poin').eq('semester', currentSemester).in('student_id', ids),
    sb.from('bayardenda').select('student_id, amount').eq('semester', currentSemester).in('student_id', ids)
  ]);
  if (attErr) console.error("Validasi lookup: attendance query failed", attErr);
  if (regErr) console.error("Validasi lookup: registrations query failed", regErr);
  if (redErr) console.error("Validasi lookup: redemptions query failed", redErr);
  if (payErr) console.error("Validasi lookup: payments query failed", payErr);

  return computeValidasiStudents(students || [], attendance || [], registrations || [], redemptions || [], payments || []);
}

function computeValidasiStudents(students, attendance, registrations, redemptions, payments) {
  const cfg = appConfig || {};
  const dendaAlpha = cfg.denda_alpha ?? 0;
  const dendaLate  = cfg.denda_terlambat ?? 0;
  const minusAlpha = cfg.nilai_minus_alpha ?? -10;
  const minusLate  = cfg.nilai_minus_terlambat ?? -5;
  const pointThreshold = cfg.minus_point_threshold ?? -30;

  const attByStudent = groupByKey(attendance, 'student_id');
  const regByStudent = groupByKey(registrations, 'student_id');
  const redByStudent = groupByKey(redemptions, 'student_id');
  const payByStudent = groupByKey(payments, 'student_id');

  return students.map(s => {
    const sAtt = attByStudent[s.id] || [];
    const sReg = regByStudent[s.id] || [];
    const sRed = redByStudent[s.id] || [];
    const sPay = payByStudent[s.id] || [];

    const byDate = {};
    sAtt.forEach(a => {
      if (!byDate[a.date]) byDate[a.date] = [];
      byDate[a.date].push(a);
    });
    const stats = { HADIR: 0, ALPHA: 0, TERLAMBAT: 0, PAGI: 0, TELAT: 0 };
    Object.values(byDate).forEach(rows => {
      const st = (deriveStatus(rows) || "-").toUpperCase();
      if (stats[st] !== undefined) stats[st]++;
    });

    const alphaCount = stats.ALPHA;
    const lateCount  = stats.TERLAMBAT + stats.TELAT + stats.PAGI;
    const totalDebt  = (alphaCount * dendaAlpha) + (lateCount * dendaLate);
    const paid       = sPay.reduce((sum, p) => sum + (p.amount || 0), 0);
    const sisa       = totalDebt - paid;

    const totalMinus = (alphaCount * minusAlpha) + (lateCount * minusLate);
    const redemptionTotal = sRed.reduce((sum, r) => sum + (r.poin || 0), 0);
    const netPoint = totalMinus + redemptionTotal;

    const pending  = sReg.find(r => r.status === 'pending');
    const rejected = sReg.filter(r => r.status === 'rejected');
    const expelled = sReg.find(r => r.status === 'expelled');
    const hasDbEkstra = s.ekstra && s.ekstra !== '0' && s.ekstra.trim() !== '';

    let regStatus = 'none';
    if (expelled) {
      regStatus = 'expelled';
    } else if (hasDbEkstra) {
      regStatus = pending ? 'pending' : 'accepted';
    } else if (pending) {
      regStatus = 'pending';
    } else if (rejected.length >= 2) {
      regStatus = 'exhausted';
    } else if (rejected.length === 1) {
      regStatus = 'rejected_once';
    }

    const hasSyaratIssue = (s.syarat_khusus || "BELUM") !== "SUDAH";
    const hasDebt = sisa > 0;
    const hasMinusPoint = netPoint < pointThreshold;

    const requirements = buildRequirements(regStatus, hasSyaratIssue, hasDebt, hasMinusPoint);
    const score = requirements.filter(r => r.ok).length;
    const ready = score === requirements.length;

    return { id: s.id, nama: s.nama, kelas: s.kelas, requirements, score, ready };
  });
}

// ============================================
// VALIDASI BOARD: RENDER
// ============================================
function renderValidasiKelasResult(kelas, students) {
  validasiEmpty.style.display = "none";
  const readyCount = students.filter(s => s.ready).length;

  validasiResult.innerHTML = `
    <div class="validasi-result-header">
      <div>
        <div class="validasi-result-title">${kelas}</div>
        <div class="validasi-result-sub">${readyCount} / ${students.length} siap validasi</div>
      </div>
      <button class="validasi-clear-btn" onclick="validasiClearResult()">✕</button>
    </div>
    <div class="validasi-student-list">
      ${students.map(s => renderStudentCardHtml(s, false)).join('')}
    </div>
  `;
  validasiResult.style.display = "block";
}

function renderValidasiStudentResult(s) {
  validasiEmpty.style.display = "none";
  validasiResult.innerHTML = `
    <div class="validasi-result-header">
      <div>
        <div class="validasi-result-title">${s.nama}</div>
        <div class="validasi-result-sub">${s.kelas}</div>
      </div>
      <button class="validasi-clear-btn" onclick="validasiClearResult()">✕</button>
    </div>
    <div class="validasi-student-list">
      ${renderStudentCardHtml(s, true)}
    </div>
  `;
  validasiResult.style.display = "block";
}

function renderStudentCardHtml(s, hideName) {
  return `
    <div class="validasi-student-card ${s.ready ? "is-ready" : ""}">
      <div class="validasi-student-top">
        <div class="validasi-student-name">${hideName ? "Status" : s.nama}</div>
        <div class="validasi-student-status">${s.ready ? "✅ Siap validasi" : `${s.score}/4 syarat`}</div>
      </div>
      <div class="validasi-req-row">
        ${s.requirements.map(r => `
          <span class="validasi-req-badge ${r.ok ? "ok" : "no"}">${r.ok ? "✓" : "✕"} ${r.label}</span>
        `).join('')}
      </div>
    </div>
  `;
}

function validasiClearResult() {
  validasiSearch.value = "";
  validasiSuggestions.innerHTML = "";
  validasiSuggestions.style.display = "none";
  validasiResult.innerHTML = "";
  validasiResult.style.display = "none";
  validasiEmpty.style.display = "flex";
  validasiSearch.focus();
}