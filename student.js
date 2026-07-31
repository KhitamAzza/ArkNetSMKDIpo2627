// ============================================
// STUDENT: DATABASE / AUTOCOMPLETE
// ============================================
async function loadDatabase() {
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getDatabase");
    const data = await res.json();
    if (data.status === "ok") {
      allStudents = data.data || [];
    }
  } catch (err) {
    console.error(err);
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
  loadStudentDashboard(); // single call instead of 3-5
}

function doStudentLogout() {
  resetSyaratUI();
  backToLogin();
  backToLanding();
}

// ============================================
// STUDENT: STATUS FASTER
// ============================================
async function loadStudentDashboard() {
  if (!currentStudent) return;

  const cacheKey = "dash_" + currentStudent.nama;
  const cachedRaw = sessionStorage.getItem(cacheKey);

  // 1. Render from cache instantly (if any) — no loading spinner yet
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      renderDashboardData(cached);
    } catch (e) {
      sessionStorage.removeItem(cacheKey);
    }
  }

  // 2. Fetch fresh data in background
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getStudentDashboard&nama=" + encodeURIComponent(currentStudent.nama));
    const data = await res.json();

    if (data.status === "ok") {
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      renderDashboardData(data);
    } else if (!cachedRaw) {
      // Only show error if we had nothing to show
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    console.error(err);
    if (!cachedRaw) {
      showStudentToast("Error koneksi", "error");
    }
    // If cache exists, silently keep stale data — user sees no interruption
  }

  showStudentLoading(false);
}

// ============================================
// STUDENT: RENDER DASHBOARD (extracted for reuse)
// ============================================
function renderDashboardData(data) {
  studentStatusData = data;

  const attendanceCard = document.getElementById("attendanceCard");
  const statusBox = document.getElementById("statusBox");
  const attendanceHeader = document.getElementById("attendanceEkstraName");

  // --- STATUS ---
  statusBox.style.display = "none";
  statusBox.className = "status-box";

  if (data.studentStatus === "accepted") {
    attendanceCard.style.display = "flex";
    statusBox.style.display = "none";
    if (attendanceHeader) attendanceHeader.textContent = "📊 Kehadiran — " + (data.ekstra || "Ekskul");

    if (data.attendance) {
      renderAttendanceDashboard(data.attendance);
    } else {
      document.getElementById("donutChartContainer").innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-secondary);font-size:14px;">Belum ada data kehadiran</div>`;
      document.getElementById("kehadiranDates").innerHTML = "";
    }

  } else if (data.studentStatus === "pending") {
    attendanceCard.style.display = "none";
    statusBox.style.display = "block";
    statusBox.classList.add("pending");
    statusIcon.textContent = "⏳";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "block";

  } else if (data.studentStatus === "expelled") {
    attendanceCard.style.display = "none";
    statusBox.style.display = "block";
    statusBox.classList.add("rejected");
    statusIcon.textContent = "🚫";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "none";

  } else if (data.studentStatus === "rejected_once") {
    attendanceCard.style.display = "none";
    statusBox.style.display = "block";
    statusBox.classList.add("rejected");
    statusIcon.textContent = "⚠️";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "none";

  } else if (data.studentStatus === "exhausted") {
    attendanceCard.style.display = "none";
    statusBox.style.display = "block";
    statusBox.classList.add("rejected");
    statusIcon.textContent = "❌";
    statusText.textContent = data.message;
    btnChangeEkstra.style.display = "none";

  } else {
    attendanceCard.style.display = "none";
    statusBox.style.display = "block";
    statusIcon.textContent = "📝";
    statusText.textContent = "Belum memilih Ekskul";
    btnChangeEkstra.style.display = "none";
  }

  // --- SYARAT ---
  currentSyaratStatus = data.syarat;
  updateSyaratUI(data.syarat);

  // --- DEBT ---
  currentDebtSisa = data.debt?.sisa || 0;
  renderDebtCard(data.debt);

  // --- MINUS POINT ---
  updatePointUI(data.minusPoint);

    // --- VALIDATION NOTICE ---
    updateValidationNotice();

    // --- SHOW/HIDE PILIH EKSKUL BUTTON ---
    const pilihBtn = document.getElementById("pilihEkskulBtn");
    if (pilihBtn) {
      const hasEkskul = data.studentStatus === "accepted" || data.studentStatus === "pending";
      pilihBtn.style.display = hasEkskul ? "none" : "flex";
    }
  }  
// ============================================
// STUDENT: ATTENDANCE ON DASHBOARD
// ============================================

function renderAttendanceDashboard(data) {
  const container = document.getElementById("donutChartContainer");
  const dates = document.getElementById("kehadiranDates");

  const stats = data.stats || { HADIR: 0, ALPHA: 0, TERLAMBAT: 0, PAGI: 0, totalDays: 1 };
  const total = stats.totalDays || 1;
  const hadir = stats.HADIR || 0;
  const alpha = stats.ALPHA || 0;
  const terlambat = stats.TERLAMBAT || 0;
  const pagi = stats.PAGI || 0;

  const hadirDeg = (hadir / total) * 360;
  const alphaDeg = hadirDeg + (alpha / total) * 360;
  const terlambatDeg = alphaDeg + (terlambat / total) * 360;
  const pagiDeg = terlambatDeg + (pagi / total) * 360;

  const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;

  container.innerHTML = `
    <div class="donut-chart" style="--hadir-deg:${hadirDeg}deg; --alpha-deg:${alphaDeg}deg; --terlambat-deg:${terlambatDeg}deg; --pagi-deg:${pagiDeg}deg;">
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
        
        return `<div class="kehadiran-date-item" style="background:${color}">
          <div class="kehadiran-date-day">${day.date}</div>
          <div>${day.status || '-'}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderDebtCard(data) {
  const sisaEl = document.getElementById("infoBarSisa");
  const menuDesc = document.getElementById("dendaMenuDesc");

  const sisa = data?.sisa || 0;
  const total = data?.total || 0;

  if (sisaEl) {
    if (sisa > 0) {
      sisaEl.textContent = "Rp " + sisa.toLocaleString("id-ID");
      sisaEl.style.color = "var(--red)";
    } else if (total > 0) {
      sisaEl.textContent = "Lunas";
      sisaEl.style.color = "var(--green)";
    } else {
      sisaEl.textContent = "Rp 0";
      sisaEl.style.color = "var(--text-secondary)";
    }
  }

  if (menuDesc) {
    if (sisa > 0) menuDesc.textContent = "Sisa Rp " + sisa.toLocaleString("id-ID");
    else if (total > 0) menuDesc.textContent = "Lunas";
    else menuDesc.textContent = "Belum ada denda";
  }

  updateValidationNotice();
}
// ============================================
// SISWA: PILIH EKSKUL LIST
// ============================================
async function showPilihEkskulList() {
  if (!currentStudent) return;

  if (studentStatusData?.studentStatus === "accepted") {
    showStudentToast("Kamu sudah diterima di ekskul", "info");
    return;
  }
  if (studentStatusData?.studentStatus === "pending") {
    showStudentToast("Kamu masih memiliki pendaftaran yang menunggu", "info");
    return;
  }
  if (studentStatusData?.studentStatus === "exhausted") {
    showStudentToast("Kesempatan pendaftaran sudah habis", "error");
    return;
  }

  dashboardScreen.style.display = "none";
  pilihEkskulListScreen.style.display = "flex";

  showStudentLoading(true);
  try {
    const [ekstraRes, countsRes] = await Promise.all([
      fetch(API_URL + "?action=getEkstraList"),
      fetch(API_URL + "?action=getEkstraWithCounts")
    ]);
    const ekstraData = await ekstraRes.json();
    const countsData = await countsRes.json();

    if (ekstraData.status === "ok" && countsData.status === "ok") {
      ekstraOptions = ekstraData.data || [];
      renderEkstraListView(ekstraOptions, countsData.data || []);
    }
  } catch (err) {
    showStudentToast("Gagal memuat daftar ekskul", "error");
  }
  showStudentLoading(false);
}

function renderEkstraListView(ekstraList, countsList) {
  ekstraListView.innerHTML = "";

  const countsMap = {};
  const pendingMap = {};
  countsList.forEach(c => {
    countsMap[c.ekstra] = c.count;
    pendingMap[c.ekstra] = c.pending || 0;
  });

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
    const acceptedCount = countsMap[ekstra] || 0;
    const pendingCount = pendingMap[ekstra] || 0;

    const item = document.createElement("div");
    item.className = "ekstra-list-item";
    item.dataset.ekstra = ekstra;
    item.dataset.search = ekstra.toLowerCase();

    const pendingHtml = pendingCount > 0
      ? `<span class="pending-pill">${pendingCount} menunggu</span>`
      : "";

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
      if (!e.target.closest(".ekstra-list-btn")) {
        selectEkstraFromList(ekstra);
      }
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
      emptyMsg.className = "ekstra-empty-search";
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

function renderEkstraList() {
  ekstraList.innerHTML = "";
  ekstraOptions.forEach(ekstra => {
    const div = document.createElement("div");
    div.className = "ekstra-item";
    div.dataset.ekstra = ekstra;
    div.innerHTML = `<div class="ekstra-icon">⭐</div><div class="ekstra-name">${ekstra}</div>`;
    div.onclick = () => selectEkstraItem(div, ekstra);
    ekstraList.appendChild(div);
  });
}

function selectEkstraItem(el, ekstra) {
  ekstraList.querySelectorAll(".ekstra-item").forEach(item => item.classList.remove("selected"));
  el.classList.add("selected");
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
  ekstraList.querySelectorAll(".ekstra-item").forEach(item => item.classList.remove("selected"));
}

function updateCharCount() {
  charCount.textContent = alasanInput.value.length;
}

function confirmDaftar() {
  const alasan = alasanInput.value.trim();
  if (!alasan) {
    showStudentToast("Alasan wajib diisi", "error");
    return;
  }
  if (alasan.length > 50) {
    showStudentToast("Alasan maksimal 50 karakter", "error");
    return;
  }
  submitEkskul(alasan);
}

async function submitEkskul(alasan) {
  if (!selectedEkstra || !currentStudent) return;

  const isChange = studentStatusData?.studentStatus === "pending";

  if (!isChange && studentStatusData?.studentStatus === "rejected_once" &&
      studentStatusData?.ekstra === selectedEkstra) {
    showStudentToast("Kamu sudah ditolak dari ekskul ini, pilih ekskul lain", "error");
    return;
  }

  btnConfirmDaftar.disabled = true;
  showStudentLoading(true);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "submitRegistration",
        nama: currentStudent.nama,
        kelas: currentStudent.kelas,
        ekstra: selectedEkstra,
        alasan: alasan,
        changePending: isChange
      })
    });

    const data = await res.json();
    if (data.status === "ok") {
      closeAlasanModal();
      showStudentToast("✓ " + data.message, "ok");
      setTimeout(() => backToDashboard(), 1200);
    } else {
      showStudentToast(data.message || "Gagal mendaftar", "error");
      btnConfirmDaftar.disabled = false;
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
    btnConfirmDaftar.disabled = false;
  }

  showStudentLoading(false);
}

function renderPeminatan(list) {
  peminatanList.innerHTML = "";
  list.forEach(item => {
    const div = document.createElement("div");
    div.className = "peminatan-item";
    div.innerHTML = `
      <div class="ekstra-icon">⭐</div>
      <div class="ekstra-name">${item.ekstra}</div>
      <div class="peminatan-count">${item.count}</div>
      <div class="peminatan-label">Jumlah anggota</div>
    `;
    peminatanList.appendChild(div);
  });
}

async function showGantiEkskul() {
  if (!currentStudent) return;

  const status = studentStatusData?.studentStatus;

  if (status === "accepted") {
    showStudentToast("Kamu sudah diterima di ekskul", "info");
    return;
  }
  if (status === "exhausted") {
    showStudentToast("Kesempatan pendaftaran sudah habis", "error");
    return;
  }

  // Allow: pending, rejected_once, expelled
  dashboardScreen.style.display = "none";
  pilihEkskulListScreen.style.display = "flex";

  showStudentLoading(true);
  try {
    const [ekstraRes, countsRes] = await Promise.all([
      fetch(API_URL + "?action=getEkstraList"),
      fetch(API_URL + "?action=getEkstraWithCounts")
    ]);
    const ekstraData = await ekstraRes.json();
    const countsData = await countsRes.json();

    if (ekstraData.status === "ok" && countsData.status === "ok") {
      ekstraOptions = ekstraData.data || [];
      renderEkstraListView(ekstraOptions, countsData.data || []);
    }
  } catch (err) {
    showStudentToast("Gagal memuat daftar ekskul", "error");
  }
  showStudentLoading(false);
}

async function loadKehadiranPercent(ekstra) {
  try {
    const res = await fetch(API_URL + "?action=getDaftarSiswa&ekstra=" + encodeURIComponent(ekstra));
    const data = await res.json();
    if (data.status === "ok") {
      const me = data.data.find(s => s.nama === currentStudent.nama);
      if (me && me.stats) {
        const total = me.stats.totalDays || 1;
        const hadir = me.stats.HADIR || 0;
        const pct = Math.round((hadir / total) * 100);
        const el = document.getElementById("statusKehadiran");
        if (el) el.textContent = pct + "%";
      }
    }
  } catch (e) { /* silent fail */ }
}

// ============================================
// STUDENT: DEBT
// ============================================

async function showDendaSaya() {
  if (!currentStudent) return;
  
  dashboardScreen.style.display = "none";
  document.getElementById("dendaScreen").style.display = "flex";

  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getStudentDebt&nama=" + encodeURIComponent(currentStudent.nama));
    const data = await res.json();
    
    if (data.status === "ok") {
      renderDendaDetail(data);
    } else {
      document.getElementById("dendaContent").innerHTML = `<div class="denda-empty">Gagal memuat data denda</div>`;
    }
  } catch (err) {
    document.getElementById("dendaContent").innerHTML = `<div class="denda-empty">Error koneksi</div>`;
  }
  showStudentLoading(false);
}

function renderDendaDetail(data) {
  const summary = document.getElementById("dendaSummaryCard");
  const payments = document.getElementById("dendaPayments");

  const sisaClass = data.sisa > 0 ? "danger" : "success";
  const sisaText = data.sisa > 0 ? "BELUM LUNAS" : "LUNAS";
  const pelanggaran = (data.counts?.terlambat || 0) + (data.counts?.pagi || 0);

  summary.innerHTML = `
    <div class="denda-big-amount ${sisaClass}">Rp ${data.sisa.toLocaleString("id-ID")}</div>
    <div class="denda-big-label">Sisa Denda</div>
    <div class="denda-stats">
      <div class="denda-stat">
        <div class="denda-stat-value">Rp ${data.total.toLocaleString("id-ID")}</div>
        <div class="denda-stat-label">Total Denda</div>
      </div>
      <div class="denda-stat">
        <div class="denda-stat-value green">Rp ${data.paid.toLocaleString("id-ID")}</div>
        <div class="denda-stat-label">Sudah Dibayar</div>
      </div>
      <div class="denda-stat">
        <div class="denda-stat-value">${pelanggaran}x</div>
        <div class="denda-stat-label">Pelanggaran</div>
      </div>
    </div>
    <div class="denda-status-pill ${sisaClass}">${sisaText}</div>
  `;

  if (data.payments && data.payments.length > 0) {
    payments.innerHTML = `
      <div class="denda-section-title">Riwayat Pembayaran (${data.payments.length})</div>
      ${data.payments.map(p => `
        <div class="denda-payment-item">
          <div class="denda-payment-left">
            <div class="denda-payment-id">${p.id}</div>
            <div class="denda-payment-meta">${p.date} • ${p.submitter}</div>
          </div>
          <div class="denda-payment-amount">- Rp ${p.amount.toLocaleString("id-ID")}</div>
        </div>
      `).join('')}
    `;
  } else {
    payments.innerHTML = `
      <div class="denda-section-title">Riwayat Pembayaran</div>
      <div class="denda-empty">Belum ada pembayaran</div>
    `;
  }
}

// ============================================
// STUDENT: SYARAT KHUSUS
// ============================================

function updateSyaratUI(syarat) {
  // Info bar inside attendance card
  const syaratEl = document.getElementById("infoBarSyarat");
  if (syaratEl) syaratEl.textContent = syarat;

  // Menu button (2nd button — non-clickable notice)
  const syaratMenuDesc = document.getElementById("syaratMenuDesc");
  const syaratMenuIcon = document.getElementById("syaratMenuIcon");
  const syaratMenuBtn = document.getElementById("syaratMenuBtn");

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

  // Must meet ALL conditions: syarat SUDAH, debt 0, AND point valid (if enabled)
  const syaratOk = currentSyaratStatus === "SUDAH";
  const debtOk = currentDebtSisa === 0;
  const pointOk = studentStatusData?.isPointValid !== false;

  if (syaratOk && debtOk && pointOk) {
    notice.textContent = "Bagus kamu bisa validasi ekskul";
    notice.className = "validation-notice success";
  } else {
    const reasons = [];
    if (!syaratOk) reasons.push("syarat khusus");
    if (!debtOk) reasons.push("denda belum lunas");
    if (!pointOk) reasons.push("minus poin terlalu rendah");
    
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
  if (syaratMenuBtn) {
    syaratMenuBtn.style.borderColor = "";
    syaratMenuBtn.style.background = "";
  }

  if (infoBarPoint) {
    infoBarPoint.textContent = "0";
    infoBarPoint.style.color = "";
  }
  if (pointMenuDesc) pointMenuDesc.textContent = "-";
  if (pointMenuIcon) pointMenuIcon.textContent = "📉";
  if (pointMenuBtn) {
    pointMenuBtn.style.borderColor = "";
    pointMenuBtn.style.background = "";
  }

  if (notice) notice.style.display = "none";
}

// ============================================
// STUDENT: MINUS POINT
// ============================================
function updatePointUI(point) {
  const displayPoint = (point === null || point === undefined) ? 0 : point;
  currentMinusPoint = displayPoint;

  const infoBarPoint = document.getElementById("infoBarPoint");
  const pointMenuDesc = document.getElementById("pointMenuDesc");
  const pointMenuIcon = document.getElementById("pointMenuIcon");
  const pointMenuBtn = document.getElementById("pointMenuBtn");

  // Check if minus point system is enabled
  const isEnabled = studentStatusData?.config?.minusPointEnable !== false;

  if (!isEnabled) {
    if (infoBarPoint) {
      infoBarPoint.textContent = "-";
      infoBarPoint.style.color = "var(--text-secondary)";
    }
    if (pointMenuDesc) pointMenuDesc.textContent = "Sistem nonaktif";
    if (pointMenuIcon) pointMenuIcon.textContent = "📊";
    if (pointMenuBtn) {
      pointMenuBtn.style.borderColor = "var(--border)";
      pointMenuBtn.style.background = "var(--card)";
    }
    return;
  }

  if (infoBarPoint) {
    infoBarPoint.textContent = displayPoint > 0 ? "+" + displayPoint : String(displayPoint);
    if (displayPoint < 0) {
      infoBarPoint.style.color = "var(--red)";
    } else if (displayPoint > 0) {
      infoBarPoint.style.color = "var(--green)";
    } else {
      infoBarPoint.style.color = "var(--text-secondary)";
    }
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

  // Use cached dashboard data for instant display
  if (studentStatusData) {
    renderPointDetail(studentStatusData);
  }

  showStudentLoading(true);
  try {
    // Fetch redemptions
    const res = await fetch(API_URL + "?action=getStudentRedemptions&nama=" + encodeURIComponent(currentStudent.nama));
    const data = await res.json();

    if (data.status === "ok") {
      renderPointHistory(data.data || []);
    }
  } catch (err) {
    console.error(err);
  }
  showStudentLoading(false);
}

function renderPointDetail(data) {
  const sisa = data.minusPoint || 0;
  const total = data.totalMinus || 0;
  const redemptionTotal = data.redemptionTotal || 0;

  pointDetailBig.textContent = sisa > 0 ? "+" + sisa : String(sisa);
  pointDetailBig.style.color = sisa < 0 ? "var(--red)" : (sisa > 0 ? "var(--green)" : "var(--text-secondary)");

  pointDetailAlpha.textContent = "Total minus poin: " + total;
  pointDetailRedemption.textContent = "Total penebusan: +" + redemptionTotal + " poin";
}

function renderPointHistory(redemptions) {
  const container = pointDetailHistory;
  if (redemptions.length === 0) {
    container.innerHTML = `
      <div class="point-history-title">Riwayat Penebusan</div>
      <div class="point-history-empty">Belum ada riwayat penebusan</div>
    `;
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