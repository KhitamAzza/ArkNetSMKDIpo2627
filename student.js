// ============================================
// STUDENT: DATABASE / AUTOCOMPLETE
// ============================================
async function loadDatabase() {
  showStudentLoading(true);
  try {
    const { data, error } = await sb.from('Database').select('id, nama, kelas, ekstra, photo_url, syarat_khusus');
    if (error) throw error;
    allStudents = data || [];
  } catch (err) {
    console.error(err);
    showStudentToast("Gagal memuat database siswa", "error");
  }
  showStudentLoading(false);
}

studentSearch.addEventListener("input", () => {
  const q = studentSearch.value.trim().toLowerCase();
  if (!q || q.length < 2) {
    searchSuggestions.style.display = "none";
    studentCardPreview.style.display = "none";
    return;
  }
  const matches = allStudents.filter(s => s.nama.toLowerCase().includes(q)).slice(0, 6);
  renderSuggestions(matches);
});

function renderSuggestions(matches) {
  searchSuggestions.innerHTML = "";
  if (matches.length === 0) {
    searchSuggestions.style.display = "none";
    return;
  }
  matches.forEach(s => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `<div class="suggestion-name">${s.nama}</div><div class="suggestion-class">${s.kelas}</div>`;
    div.onclick = () => selectStudent(s);
    searchSuggestions.appendChild(div);
  });
  searchSuggestions.style.display = "block";
}

function selectStudent(student) {
  currentStudent = student;
  studentSearch.value = student.nama;
  searchSuggestions.style.display = "none";
  previewName.textContent = student.nama;
  previewClass.textContent = student.kelas;
  studentCardPreview.style.display = "block";
}

// ============================================
// STUDENT: NAVIGATION
// ============================================
function goToDashboard() {
  if (!currentStudent) return;
  studentLoginScreen.style.display = "none";
  dashboardScreen.style.display = "flex";
  headerGreeting.textContent = "";

  document.getElementById("studentInfoName").textContent = currentStudent.nama;
  document.getElementById("studentInfoClass").textContent = currentStudent.kelas;

  const semEl = document.getElementById("studentSemester");
  if (semEl) semEl.textContent = currentSemester || "-";

  loadStudentDashboard();
}

function backToLogin() {
  dashboardScreen.style.display = "none";
  pilihEkskulScreen.style.display = "none";
  peminatanScreen.style.display = "none";
  studentLoginScreen.style.display = "flex";
  studentSearch.value = "";
  searchSuggestions.style.display = "none";
  studentCardPreview.style.display = "none";
  currentStudent = null;
  resetSyaratUI();
}

function backToDashboard() {
  pilihEkskulScreen.style.display = "none";
  pilihEkskulListScreen.style.display = "none";
  kehadiranScreen.style.display = "none";
  peminatanScreen.style.display = "none";
  document.getElementById("dendaScreen").style.display = "none";
  dashboardScreen.style.display = "flex";
  selectedEkstra = null;
  ekstraDetailBar.style.display = "none";
  loadStudentDashboard();
}

function doStudentLogout() {
  resetSyaratUI();
  backToLogin();
  backToLanding();
}

// ============================================
// STUDENT: DASHBOARD
// ============================================
async function loadStudentDashboard() {
  if (!currentStudent) return;
  showStudentLoading(true);

  try {
    const status = await getStudentRegistrationStatus(currentStudent.id);
    studentStatusData = status;

    const attendance = await loadStudentAttendance(currentStudent.id);
    const stats = attendance.stats || { HADIR: 0, ALPHA: 0, TERLAMBAT: 0, PAGI: 0, TELAT: 0, totalDays: 0 };

    // --- RULE ENGINE: DEBT ---
    const alphaCount   = stats.ALPHA || 0;
    const pagiCount    = stats.PAGI || 0;
    const lateCount    = (stats.TERLAMBAT || 0) + (stats.TELAT || 0) + pagiCount;
    const dendaAlpha   = appConfig?.denda_alpha || 0;
    const dendaLate    = appConfig?.denda_terlambat || 0;
    const totalDebt    = (alphaCount * dendaAlpha) + (lateCount * dendaLate);

    // --- FETCH PAYMENTS from bayardenda ---
    let paid = 0;
    let paymentHistory = [];
    try {
      const { data: pays } = await sb
        .from('bayardenda')
        .select('amount, created_at, submitter')
        .eq('student_id', currentStudent.id)
        .eq('semester', currentSemester)
        .order('created_at', { ascending: false });
      paymentHistory = pays || [];
      paid = paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0);
    } catch (e) { paid = 0; }

    const sisa = totalDebt - paid;

    // --- RULE ENGINE: MINUS POINT ---
    const minusAlpha   = appConfig?.nilai_minus_alpha ?? -10;
    const minusLate    = appConfig?.nilai_minus_terlambat ?? -5;
    const totalMinus   = (alphaCount * minusAlpha) + (lateCount * minusLate);

    // --- LOAD REDEMPTIONS ---
    let redemptionTotal = 0;
    try {
      const { data: reds } = await sb
        .from('Redemptions')
        .select('poin')
        .eq('student_id', currentStudent.id)
        .eq('semester', currentSemester);
      redemptionTotal = (reds || []).reduce((s, r) => s + (r.poin || 0), 0);
    } catch (e) { redemptionTotal = 0; }

    const netPoint      = totalMinus + redemptionTotal;
    const pointThreshold = appConfig?.minus_point_threshold ?? -30;
    const isPointValid  = netPoint >= pointThreshold;

    const debt = {
      sisa: sisa,
      total: totalDebt,
      paid: paid,
      counts: { alpha: alphaCount, terlambat: (stats.TERLAMBAT || 0) + (stats.TELAT || 0), pagi: pagiCount },
      history: paymentHistory
    };

    const data = {
      studentStatus: status.status,
      ekstra: status.ekstra,
      message: status.message,
      alasan: status.alasan,
      attendance: attendance,
      syarat: currentStudent.syarat_khusus || "BELUM",
      debt: debt,
      minusPoint: totalMinus,
      redemptionTotal: redemptionTotal,
      sisaPoin: netPoint,
      isPointValid: isPointValid,
      config: appConfig
    };

    lastDashboardData = data;
    renderDashboardData(data);
  } catch (err) {
    console.error(err);
    showStudentToast("Error memuat dashboard", "error");
  }

  showStudentLoading(false);
}

async function getStudentRegistrationStatus(studentId) {
  // Source of truth #1: Database.ekstra column (current assignment)
  const dbEkstra = currentStudent?.ekstra;
  const hasDbEkstra = dbEkstra && dbEkstra !== '0' && dbEkstra.trim() !== '';

  // Source of truth #2: Registration history for messaging
  const { data: regs, error } = await sb
    .from('registrations')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = regs || [];

  const pending = rows.find(r => r.status === 'pending');
  const rejected = rows.filter(r => r.status === 'rejected');
  const expelled = rows.find(r => r.status === 'expelled');

  // Expelled overrides everything
  if (expelled) {
    return { status: 'expelled', ekstra: expelled.ekstra, message: `Kamu dikeluarkan dari ${expelled.ekstra}`,alasan: expelled.alasan };
  }

  // If Database says they have an ekstra → they are accepted
  if (hasDbEkstra) {
    // If they also have a pending change request, show pending instead
    if (pending) {
      return { status: 'pending', ekstra: pending.ekstra, message: `Pendaftaran ke ${pending.ekstra} sedang diproses` };
    }
    return { status: 'accepted', ekstra: dbEkstra, message: `Kamu diterima di ${dbEkstra}` };
  }

  // No ekstra in Database — rely on registration history
  if (pending) {
    return { status: 'pending', ekstra: pending.ekstra, message: `Pendaftaran ke ${pending.ekstra} sedang diproses` };
  }
  if (rejected.length >= 2) {
    return { status: 'exhausted', ekstra: null, message: "Kesempatan pendaftaran sudah habis" };
  }
  if (rejected.length === 1) {
    return { status: 'rejected_once', ekstra: rejected[0].ekstra, message: `Pendaftaran ke ${rejected[0].ekstra} ditolak. Kamu punya 1 kesempatan lagi.` };
  }

  return { status: null, ekstra: null, message: "Belum memilih Ekskul" };
}
async function loadStudentAttendance(studentId) {
  const { data: rows, error } = await sb
    .from('AttendanceV2')              // ← changed table
    .select('date, status')            // ← removed period
    .eq('student_id', studentId)
    .eq('semester', currentSemester)
    .order('date', { ascending: true });

  if (error) throw error;

  const byDate = {};
  (rows || []).forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  const attendance = Object.entries(byDate).map(([date, dayRows]) => ({
    date,
    status: deriveStatus(dayRows)
  }));

  const stats = { HADIR: 0, ALPHA: 0, TERLAMBAT: 0, PAGI: 0, TELAT: 0, totalDays: attendance.length };
  attendance.forEach(day => {
    const st = (day.status || "-").toUpperCase();
    if (stats[st] !== undefined) stats[st]++;
  });

  return { attendance, stats };
}

function deriveStatus(rows) {
  if (!rows || rows.length === 0) return null;
  // AttendanceV2 stores the final status directly — no period logic needed
  const explicit = rows.find(r => r.status?.trim());
  if (explicit) return explicit.status.trim().toUpperCase();
  return null;
}

// ============================================
// STUDENT: RENDER DASHBOARD
// ============================================
function renderDashboardData(data) {
  const attendanceCard = document.getElementById("attendanceCard");
  const statusBoxEl = document.getElementById("statusBox");
  const statusDetail = document.getElementById("statusDetail");
  const attendanceHeader = document.getElementById("attendanceEkstraName");
  const noEkskulBanner = document.getElementById("noEkskulBanner");

  const hasEkskul = currentStudent.ekstra && currentStudent.ekstra !== '0' && currentStudent.ekstra.trim() !== '';
  if (noEkskulBanner) {
    noEkskulBanner.style.display = hasEkskul ? "none" : "block";
  }

  // UNIVERSAL: attendance card + donut + info bar always visible
  attendanceCard.style.display = "flex";
  if (attendanceHeader) attendanceHeader.textContent = "📊 " + (data.ekstra || "Kehadiran");

  if (data.attendance) {
    renderAttendanceDashboard(data.attendance);
  } else {
    document.getElementById("donutChartContainer").innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-secondary);font-size:14px;">Belum ada data kehadiran</div>`;
    document.getElementById("kehadiranDates").innerHTML = "";
  }

  // Reset status box
  statusBoxEl.className = "status-box";
  statusBoxEl.style.display = "none";
  if (statusDetail) statusDetail.style.display = "none";

  // Contextual banner — moved above the donut for pressure hierarchy
  if (data.studentStatus === "accepted") {
    statusBoxEl.style.display = "none";
    btnChangeEkstra.style.display = "none";
  } else if (data.studentStatus === "pending") {
    statusBoxEl.style.display = "block";
    statusBoxEl.classList.add("pending");
    statusIcon.textContent = "⏳";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "block";
    attendanceCard.before(statusBoxEl);
  } else if (data.studentStatus === "expelled") {
    statusBoxEl.style.display = "block";
    statusBoxEl.classList.add("rejected");
    statusIcon.textContent = "🚫";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "none";
    if (statusDetail) {
      statusDetail.style.display = "block";
      statusDetail.innerHTML = `<span class="label">Alasan dikeluarkan:</span> <span class="value red">${data.alasan || "Tidak ada keterangan"}</span>`;
    }
    attendanceCard.before(statusBoxEl);
  } else if (data.studentStatus === "rejected_once") {
    statusBoxEl.style.display = "block";
    statusBoxEl.classList.add("rejected");
    statusIcon.textContent = "⚠️";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "none";
    attendanceCard.before(statusBoxEl);
  } else if (data.studentStatus === "exhausted") {
    statusBoxEl.style.display = "block";
    statusBoxEl.classList.add("rejected");
    statusIcon.textContent = "❌";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "none";
    attendanceCard.before(statusBoxEl);
  } else {
    // No ekskul
    statusBoxEl.style.display = "block";
    statusIcon.textContent = "📝";
    statusText.textContent = "Belum memilih Ekskul";
    btnChangeEkstra.style.display = "none";
    attendanceCard.before(statusBoxEl);
  }

  // UNIVERSAL: 3 requirements always rendered
  currentSyaratStatus = data.syarat;
  updateSyaratUI(data.syarat);
  currentDebtSisa = data.debt?.sisa || 0;
  renderDebtCard(data.debt);
  updatePointUI(data.sisaPoin);
  updateValidationNotice();

  const pilihBtn = document.getElementById("pilihEkskulBtn");
  if (pilihBtn) {
    const blockPilih = data.studentStatus === "accepted" || data.studentStatus === "exhausted" || data.studentStatus === "expelled";
    pilihBtn.style.display = blockPilih ? "none" : "flex";
  }
}
// ============================================
// STUDENT: ATTENDANCE RENDER
// ============================================
function renderAttendanceDashboard(data) {
  const container = document.getElementById("donutChartContainer");
  const dates = document.getElementById("kehadiranDates");

  const stats = data.stats || { HADIR: 0, ALPHA: 0, TERLAMBAT: 0, PAGI: 0, TELAT: 0, totalDays: 1 };
  const total = stats.totalDays || 1;
  const hadir = stats.HADIR || 0;
  const alpha = stats.ALPHA || 0;
  const terlambat = stats.TERLAMBAT || 0;
  const pagi = stats.PAGI || 0;
  const telat = stats.TELAT || 0;

  const hadirDeg = (hadir / total) * 360;
  const alphaDeg = hadirDeg + (alpha / total) * 360;
  const terlambatDeg = alphaDeg + (terlambat / total) * 360;
  const pagiDeg = terlambatDeg + (pagi / total) * 360;
  const telatDeg = pagiDeg + (telat / total) * 360;

  const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;

  container.innerHTML = `
    <div class="donut-chart" style="--hadir-deg:${hadirDeg}deg; --alpha-deg:${alphaDeg}deg; --terlambat-deg:${terlambatDeg}deg; --pagi-deg:${pagiDeg}deg; --telat-deg:${telatDeg}deg;">
      <div class="donut-hole">
        <div class="donut-percent">${pct}%</div>
        <div class="donut-label">Kehadiran</div>
      </div>
    </div>
  `;

  const attendance = data.attendance || [];
  dates.innerHTML = `
    <div class="kehadiran-dates-title">Riwayat Kehadiran (${attendance.length} hari)</div>
    <div class="kehadiran-date-grid">
      ${attendance.slice().reverse().slice(0, 30).map(day => {
        let color = "#64748b";
        const st = (day.status || "-").toUpperCase();
        if (st === "HADIR") color = "var(--green)";
        else if (st === "ALPHA") color = "var(--red)";
        else if (st === "TERLAMBAT" || st === "PAGI") color = "var(--yellow)";
        else if (st === "TELAT") color = "#f97316";
        return `<div class="kehadiran-date-item" style="background:${color}">
          <div class="kehadiran-date-day">${day.date}</div>
          <div>${day.status || '-'}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ============================================
// STUDENT: PILIH EKSKUL LIST
// ============================================
async function showPilihEkskulList() {
  if (!currentStudent) return;

  const status = studentStatusData?.status;
  if (status === "accepted") { showStudentToast("Kamu sudah diterima di ekskul", "info"); return; }
  if (status === "pending") { showStudentToast("Kamu masih memiliki pendaftaran yang menunggu", "info"); return; }
  if (status === "exhausted") { showStudentToast("Kesempatan pendaftaran sudah habis", "error"); return; }

  dashboardScreen.style.display = "none";
  pilihEkskulListScreen.style.display = "flex";
  showStudentLoading(true);

  try {
    const { data: dbRows } = await sb.from('Database').select('ekstra').not('ekstra', 'is', null);
    const allEkstra = [...new Set((dbRows || []).map(r => r.ekstra).filter(Boolean))].sort();

    const { data: acceptedRows } = await sb.from('Database').select('ekstra').not('ekstra', 'is', null);
    const acceptedMap = {};
    (acceptedRows || []).forEach(r => { acceptedMap[r.ekstra] = (acceptedMap[r.ekstra] || 0) + 1; });

    const { data: pendingRows } = await sb.from('registrations').select('ekstra').eq('status', 'pending');
    const pendingMap = {};
    (pendingRows || []).forEach(r => { pendingMap[r.ekstra] = (pendingMap[r.ekstra] || 0) + 1; });

    ekstraOptions = allEkstra;
    renderEkstraListView(ekstraOptions, acceptedMap, pendingMap);
  } catch (err) {
    showStudentToast("Gagal memuat daftar ekskul", "error");
  }
  showStudentLoading(false);
}

function renderEkstraListView(ekstraList, acceptedMap, pendingMap) {
  ekstraListView.innerHTML = "";

  const searchWrap = document.createElement("div");
  searchWrap.className = "ekstra-search-box";
  searchWrap.innerHTML = `
    <input type="text" class="ekstra-search-input" placeholder="Cari ekskul..." 
      oninput="filterEkstraList(this.value)" autocomplete="off">
  `;
  ekstraListView.appendChild(searchWrap);

  const listContainer = document.createElement("div");
  listContainer.className = "ekstra-list-container";
  listContainer.id = "ekstraListContainer";

  ekstraList.forEach((ekstra) => {
    const acceptedCount = acceptedMap[ekstra] || 0;
    const pendingCount = pendingMap[ekstra] || 0;

    const item = document.createElement("div");
    item.className = "ekstra-list-item";
    item.dataset.ekstra = ekstra;
    item.dataset.search = ekstra.toLowerCase();

    const pendingHtml = pendingCount > 0
      ? `<span class="pending-pill">${pendingCount} menunggu</span>` : "";

    item.innerHTML = `
      <div class="ekstra-list-left">
        <div class="ekstra-list-info">
          <div class="ekstra-list-name">${ekstra}</div>
          <div class="ekstra-list-count">
            <span class="accepted">${acceptedCount}</span> diterima
            ${pendingHtml}
          </div>
        </div>
      </div>
      <button class="ekstra-list-btn" onclick="event.stopPropagation();selectEkstraFromList('${ekstra}')">Daftar</button>
    `;

    item.onclick = (e) => {
      if (!e.target.closest(".ekstra-list-btn")) selectEkstraFromList(ekstra);
    };

    listContainer.appendChild(item);
  });

  ekstraListView.appendChild(listContainer);
}

function filterEkstraList(query) {
  const q = query.toLowerCase().trim();
  const items = document.querySelectorAll("#ekstraListContainer .ekstra-list-item");
  let visibleCount = 0;
  items.forEach(item => {
    const match = item.dataset.search.includes(q);
    item.style.display = match ? "flex" : "none";
    if (match) visibleCount++;
  });

  let emptyMsg = document.getElementById("ekstraEmptySearch");
  if (visibleCount === 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement("div");
      emptyMsg.id = "ekstraEmptySearch";
      emptyMsg.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-secondary);font-size:15px;">Tidak ada ekskul yang cocok</div>`;
      document.getElementById("ekstraListContainer").appendChild(emptyMsg);
    }
  } else if (emptyMsg) {
    emptyMsg.remove();
  }
}

function selectEkstraFromList(ekstra) {
  selectedEkstra = ekstra;
  openAlasanModal();
}

function openAlasanModal() {
  modalSelectedEkstra.textContent = selectedEkstra;
  alasanInput.value = "";
  charCount.textContent = "0";
  btnConfirmDaftar.disabled = false;
  alasanModal.classList.add("visible");
  setTimeout(() => alasanInput.focus(), 100);
}

function closeAlasanModal() {
  alasanModal.classList.remove("visible");
  selectedEkstra = null;
  btnConfirmDaftar.disabled = false;
}

function updateCharCount() {
  charCount.textContent = alasanInput.value.length;
}

function confirmDaftar() {
  const alasan = alasanInput.value.trim();
  if (!alasan) { showStudentToast("Alasan wajib diisi", "error"); return; }
  if (alasan.length > 50) { showStudentToast("Alasan maksimal 50 karakter", "error"); return; }
  submitEkskul(alasan);
}

async function submitEkskul(alasan) {
  if (!selectedEkstra || !currentStudent) return;

  const { data: pendingRegs } = await sb
    .from('registrations')
    .select('*')
    .eq('student_id', currentStudent.id)
    .eq('status', 'pending');
  const isChange = (pendingRegs || []).length > 0;
  const existingPending = pendingRegs?.[0];

  const { data: pastRegs } = await sb
    .from('registrations')
    .select('status')
    .eq('student_id', currentStudent.id)
    .eq('status', 'rejected');
  const rejectedCount = (pastRegs || []).length;
  const pilihanKe = rejectedCount >= 1 ? 2 : 1;

  if (!isChange && rejectedCount >= 2) {
    showStudentToast("Kesempatan pendaftaran sudah habis", "error");
    return;
  }
  if (!isChange && studentStatusData?.status === 'rejected_once' && studentStatusData?.ekstra === selectedEkstra) {
    showStudentToast("Kamu sudah ditolak dari ekskul ini, pilih ekskul lain", "error");
    return;
  }

  btnConfirmDaftar.disabled = true;
  showStudentLoading(true);

  try {
    if (isChange && existingPending) {
      const { error } = await sb.from('registrations').update({
        ekstra: selectedEkstra,
        alasan: alasan,
        updated_at: new Date().toISOString()
      }).eq('id', existingPending.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('registrations').insert({
        student_id: currentStudent.id,
        nama: currentStudent.nama,
        kelas: currentStudent.kelas,
        ekstra: selectedEkstra,
        status: 'pending',
        alasan: alasan,
        pilihan_ke: pilihanKe,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
    }

    closeAlasanModal();
    showStudentToast("✓ Pendaftaran berhasil dikirim", "ok");
    setTimeout(() => backToDashboard(), 1200);
  } catch (err) {
    showStudentToast("Error: " + err.message, "error");
    btnConfirmDaftar.disabled = false;
  }
  showStudentLoading(false);
}

async function showGantiEkskul() {
  if (!currentStudent) return;
  const status = studentStatusData?.status;
  if (status === "accepted") { showStudentToast("Kamu sudah diterima di ekskul", "info"); return; }
  if (status === "exhausted") { showStudentToast("Kesempatan pendaftaran sudah habis", "error"); return; }
  showPilihEkskulList();
}

// ============================================
// STUDENT: DEBT (placeholder — payment tables coming later)
// ============================================
function renderDebtCard(data) {
  const sisaEl = document.getElementById("infoBarSisa");
  const menuDesc = document.getElementById("dendaMenuDesc");
  const sisa = data?.sisa || 0;
  const total = data?.total || 0;

  if (sisaEl) {
    if (sisa > 0) { sisaEl.textContent = "Rp " + sisa.toLocaleString("id-ID"); sisaEl.style.color = "var(--red)"; }
    else if (total > 0) { sisaEl.textContent = "Lunas"; sisaEl.style.color = "var(--green)"; }
    else { sisaEl.textContent = "Rp 0"; sisaEl.style.color = "var(--text-secondary)"; }
  }
  if (menuDesc) {
    if (sisa > 0) menuDesc.textContent = "Sisa Rp " + sisa.toLocaleString("id-ID");
    else if (total > 0) menuDesc.textContent = "Lunas";
    else menuDesc.textContent = "Belum ada denda";
  }
}

async function showDendaSaya() {
  if (!currentStudent) return;
  dashboardScreen.style.display = "none";
  const dendaScreen = document.getElementById("dendaScreen");
  const dendaContent = document.getElementById("dendaContent");
  if (!dendaScreen || !dendaContent) return;
  dendaScreen.style.display = "flex";
  showStudentLoading(true);

  try {
    // Reload fresh data
    const { data: rows, error: attErr } = await sb
      .from('AttendanceV2')
      .select('status')
      .eq('student_id', currentStudent.id)
      .eq('semester', currentSemester)
      .in('status', ['ALPHA', 'TERLAMBAT', 'TELAT', 'PAGI']);
    if (attErr) throw attErr;

    const { data: pays, error: payErr } = await sb
      .from('bayardenda')
      .select('amount, created_at, submitter')
      .eq('student_id', currentStudent.id)
      .eq('semester', currentSemester)
      .order('created_at', { ascending: false });
    if (payErr) throw payErr;

    const cfg = appConfig || {};
    const dendaAlpha = cfg.denda_alpha || 0;
    const dendaLate  = cfg.denda_terlambat || 0;

    let alphaCount = 0;
    let lateCount  = 0;
    (rows || []).forEach(r => {
      const st = (r.status || '').trim().toUpperCase();
      if (st === 'ALPHA') alphaCount++;
      else lateCount++;
    });

    const total = (alphaCount * dendaAlpha) + (lateCount * dendaLate);
    const paid  = (pays || []).reduce((s, p) => s + (p.amount || 0), 0);
    const sisa  = total - paid;

    const fmtDate = (iso) => {
      if (!iso) return '-';
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    dendaContent.innerHTML = `
      <div style="padding:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px;">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px 6px;text-align:center;">
            <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Total</div>
            <div style="font-size:14px;font-weight:800;">Rp ${total.toLocaleString('id-ID')}</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px 6px;text-align:center;">
            <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Sudah</div>
            <div style="font-size:14px;font-weight:800;color:var(--green);">Rp ${paid.toLocaleString('id-ID')}</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px 6px;text-align:center;">
            <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Sisa</div>
            <div style="font-size:14px;font-weight:800;color:${sisa > 0 ? 'var(--red)' : 'var(--green)'};">Rp ${sisa.toLocaleString('id-ID')}</div>
          </div>
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Riwayat Pembayaran</div>
        ${(pays || []).length === 0 ? `
          <div style="text-align:center;padding:32px;color:var(--text-secondary);font-size:14px;">
            <div style="font-size:32px;margin-bottom:8px;">💰</div>
            <div>Belum ada pembayaran</div>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${(pays || []).map(p => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--card);border:1px solid var(--border);border-radius:12px;">
                <div>
                  <div style="font-size:13px;font-weight:700;color:var(--green);">Rp ${Number(p.amount).toLocaleString('id-ID')}</div>
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${fmtDate(p.created_at)}</div>
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Diterima oleh: ${p.submitter || '-'}</div>
                </div>
                <div style="font-size:11px;color:var(--text-secondary);font-weight:600;white-space:nowrap;">✓ Lunas</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  } catch (err) {
    dendaContent.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">
        <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:16px;font-weight:700;">Gagal memuat data denda</div>
        <div style="font-size:13px;margin-top:4px;">${err.message}</div>
      </div>
    `;
  }

  showStudentLoading(false);
}

// ============================================
// STUDENT: SYARAT KHUSUS
// ============================================
function updateSyaratUI(syarat) {
  const syaratEl = document.getElementById("infoBarSyarat");
  const syaratMenuDesc = document.getElementById("syaratMenuDesc");
  const syaratMenuIcon = document.getElementById("syaratMenuIcon");
  const syaratMenuBtn = document.getElementById("syaratMenuBtn");

  if (syaratEl) syaratEl.textContent = syarat;
  if (syaratMenuDesc) syaratMenuDesc.textContent = syarat;
  if (syaratMenuIcon) syaratMenuIcon.textContent = syarat === "SUDAH" ? "✅" : "📋";

  if (syaratMenuBtn) {
    if (syarat === "SUDAH") {
      syaratMenuBtn.style.borderColor = "rgba(16, 185, 129, 0.3)";
      syaratMenuBtn.style.background = "rgba(16, 185, 129, 0.06)";
    } else {
      syaratMenuBtn.style.borderColor = "rgba(239, 68, 68, 0.3)";
      syaratMenuBtn.style.background = "rgba(239, 68, 68, 0.06)";
    }
  }
}

function updateValidationNotice() {
  const notice = document.getElementById("validationNotice");
  if (!notice) return;
  if (currentSyaratStatus === null || currentDebtSisa === null) {
    notice.style.display = "none";
    return;
  }
  notice.style.display = "block";
  const syaratOk = currentSyaratStatus === "SUDAH";
  const debtOk   = currentDebtSisa === 0;
    const pointOk  = (currentMinusPoint || 0) >= (appConfig?.minus_point_threshold ?? -30);

  if (syaratOk && debtOk && pointOk) {
    notice.textContent = "Bagus kamu bisa validasi ekskul";
    notice.className = "validation-notice success";
  } else {
    const reasons = [];
    if (!syaratOk) reasons.push("syarat khusus");
    if (!debtOk)   reasons.push("denda belum lunas");
    if (!pointOk)  reasons.push("minus poin terlalu rendah");
    notice.textContent = "Syarat validasi belum terpenuhi: " + reasons.join(", ");
    notice.className = "validation-notice warning";
  }
}

function resetSyaratUI() {
  currentSyaratStatus = null;
  currentDebtSisa = null;
  currentMinusPoint = null;
  const syaratEl = document.getElementById("infoBarSyarat");
  const syaratMenuDesc = document.getElementById("syaratMenuDesc");
  const syaratMenuIcon = document.getElementById("syaratMenuIcon");
  const syaratMenuBtn = document.getElementById("syaratMenuBtn");
  const notice = document.getElementById("validationNotice");
  const infoBarPoint = document.getElementById("infoBarPoint");
  const pointMenuDesc = document.getElementById("pointMenuDesc");
  const pointMenuIcon = document.getElementById("pointMenuIcon");
  const pointMenuBtn = document.getElementById("pointMenuBtn");

  if (syaratEl) syaratEl.textContent = "-";
  if (syaratMenuDesc) syaratMenuDesc.textContent = "-";
  if (syaratMenuIcon) syaratMenuIcon.textContent = "📋";
  if (syaratMenuBtn) { syaratMenuBtn.style.borderColor = ""; syaratMenuBtn.style.background = ""; }
  if (infoBarPoint) { infoBarPoint.textContent = "0"; infoBarPoint.style.color = ""; }
  if (pointMenuDesc) pointMenuDesc.textContent = "-";
  if (pointMenuIcon) pointMenuIcon.textContent = "📉";
  if (pointMenuBtn) { pointMenuBtn.style.borderColor = ""; pointMenuBtn.style.background = ""; }
  if (notice) notice.style.display = "none";
}

// ============================================
// STUDENT: MINUS POINT (placeholder)
// ============================================
function updatePointUI(point) {
  const displayPoint = (point === null || point === undefined) ? 0 : point;
  currentMinusPoint = displayPoint;
  const infoBarPoint = document.getElementById("infoBarPoint");
  const pointMenuDesc = document.getElementById("pointMenuDesc");
  const pointMenuIcon = document.getElementById("pointMenuIcon");
  const pointMenuBtn = document.getElementById("pointMenuBtn");
  const isEnabled = appConfig?.minus_point_enable !== false;

  if (!isEnabled) {
    if (infoBarPoint) { infoBarPoint.textContent = "-"; infoBarPoint.style.color = "var(--text-secondary)"; }
    if (pointMenuDesc) pointMenuDesc.textContent = "Sistem nonaktif";
    if (pointMenuIcon) pointMenuIcon.textContent = "📊";
    if (pointMenuBtn) { pointMenuBtn.style.borderColor = "var(--border)"; pointMenuBtn.style.background = "var(--card)"; }
    return;
  }
  if (infoBarPoint) {
    infoBarPoint.textContent = displayPoint > 0 ? "+" + displayPoint : String(displayPoint);
    infoBarPoint.style.color = displayPoint < 0 ? "var(--red)" : (displayPoint > 0 ? "var(--green)" : "var(--text-secondary)");
  }
  if (pointMenuDesc) pointMenuDesc.textContent = displayPoint + " poin";
  if (pointMenuIcon) pointMenuIcon.textContent = displayPoint < 0 ? "📉" : "📊";
  if (pointMenuBtn) {
    if (displayPoint < 0) {
      pointMenuBtn.style.borderColor = "rgba(239, 68, 68, 0.3)";
      pointMenuBtn.style.background = "rgba(239, 68, 68, 0.06)";
    } else {
      pointMenuBtn.style.borderColor = "var(--border)";
      pointMenuBtn.style.background = "var(--card)";
    }
  }
}

async function showPointDetail() {
  if (!currentStudent) return;
  dashboardScreen.style.display = "none";
  pointDetailScreen.style.display = "flex";

  const pointData = lastDashboardData || {
    minusPoint: 0,
    redemptionTotal: 0,
    sisaPoin: 0
  };
  renderPointDetail(pointData);

  // Load redemption history if table exists
  try {
    const { data: reds } = await sb
      .from('Redemptions')
      .select('*')
      .eq('student_id', currentStudent.id)
      .eq('semester', currentSemester)
      .order('created_at', { ascending: false });
    renderPointHistory(reds || []);
  } catch (e) {
    renderPointHistory([]);
  }
}

function renderPointDetail(data) {
  const rawMinus = data.minusPoint || 0;
  const redemptionTotal = data.redemptionTotal || 0;
  const sisa = data.sisaPoin || 0;
  const minusEl = document.getElementById("pointCompareMinus");
  const plusEl = document.getElementById("pointComparePlus");
  const netValue = document.getElementById("pointNetValue");
  if (minusEl) minusEl.textContent = String(rawMinus);
  if (plusEl) plusEl.textContent = "+" + redemptionTotal;
  if (netValue) {
    netValue.textContent = sisa > 0 ? "+" + sisa : String(sisa);
    netValue.className = sisa < 0 ? "point-net-minus" : (sisa > 0 ? "point-net-plus" : "");
  }
}

function renderPointHistory(redemptions) {
  const container = pointDetailHistory;
  if (redemptions.length === 0) {
    container.innerHTML = `<div class="point-history-title">Riwayat Penebusan</div><div class="point-history-empty">Belum ada riwayat</div>`;
    return;
  }
  container.innerHTML = `
    <div class="point-history-title">Riwayat Penebusan (${redemptions.length})</div>
    <div class="point-history-list">
      ${redemptions.map(r => `
        <div class="point-history-item">
          <div class="point-history-poin">+${r.poin} Poin</div>
          <div class="point-history-guru">${r.guru}</div>
          <div class="point-history-desc">${r.deskripsi}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================
// STUDENT: EVENT LISTENERS
// ============================================
document.addEventListener("click", (e) => {
  if (!e.target.closest(".student-search-box")) {
    searchSuggestions.style.display = "none";
  }
});