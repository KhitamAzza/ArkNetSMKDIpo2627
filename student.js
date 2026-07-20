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
  headerGreeting.textContent = "Halo " + currentStudent.nama.split(" ")[0];
  
  // Show name and class prominently
  document.getElementById("studentInfoName").textContent = currentStudent.nama;
  document.getElementById("studentInfoClass").textContent = currentStudent.kelas;
  
  loadStudentStatus();
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
  dashboardScreen.style.display = "flex";
  selectedEkstra = null;
  ekstraDetailBar.style.display = "none";
  loadStudentStatus();
}

function doStudentLogout() {
  resetSyaratUI();
  backToLogin();
  backToLanding();
}

// ============================================
// STUDENT: STATUS
// ============================================
async function loadStudentStatus() {
  if (!currentStudent) return;
  showStudentLoading(true);
  
  const attendanceCard = document.getElementById("attendanceCard");
  const statusBox = document.getElementById("statusBox");
  const attendanceHeader = document.getElementById("attendanceEkstraName");
  
  try {
    const res = await fetch(API_URL + "?action=getStudentStatus&nama=" + encodeURIComponent(currentStudent.nama));
    const data = await res.json();
    studentStatusData = data;
    
    statusBox.style.display = "none";
    statusBox.className = "status-box";

        if (data.studentStatus === "accepted") {
      attendanceCard.style.display = "flex";
      statusBox.style.display = "none";
      
      // Show ekskul name in header
      if (attendanceHeader) {
        attendanceHeader.textContent = "📊 Kehadiran — " + (data.ekstra || "Ekskul");
      }
      
      // Load and render attendance
      await loadAttendanceForDashboard(data.ekstra);
      
      // Load syarat khusus from Kehadiran Siswa
      await loadStudentSyarat(data.ekstra);
      
    } else if (data.studentStatus === "pending") {

      attendanceCard.style.display = "none";
      statusBox.style.display = "block";
      statusBox.classList.add("pending");
      statusIcon.textContent = "⏳";
      statusText.textContent = "Menunggu konfirmasi untuk ekskul " + data.ekstra;
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
  } catch (err) {
    attendanceCard.style.display = "none";
    statusBox.style.display = "block";
    statusIcon.textContent = "⚠️";
    statusText.textContent = "Gagal memuat status";
    btnChangeEkstra.style.display = "none";
  }
  showStudentLoading(false);
}

// ============================================
// STUDENT: ATTENDANCE ON DASHBOARD
// ============================================
async function loadAttendanceForDashboard(ekstra) {
  const container = document.getElementById("donutChartContainer");
  const summary = document.getElementById("kehadiranSummary");
  const dates = document.getElementById("kehadiranDates");
  
  try {
    const res = await fetch(API_URL + "?action=getDaftarSiswa&ekstra=" + encodeURIComponent(ekstra || ""));
    const data = await res.json();
    
    if (data.status === "ok") {
      const myData = data.data.find(s => s.nama === currentStudent.nama);
      if (myData) {
        renderAttendanceDashboard(myData);
      } else {
        // No attendance data yet
        container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-secondary);font-size:14px;">Belum ada data kehadiran</div>`;
        summary.innerHTML = "";
        dates.innerHTML = "";
      }
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-secondary);font-size:14px;">Gagal memuat kehadiran</div>`;
    summary.innerHTML = "";
    dates.innerHTML = "";
  }
}

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

  // Donut only — no legend, no summary grid
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

  currentDebtSisa = data.sisa || 0;

  if (data.sisa > 0) {
    sisaEl.textContent = "Rp " + data.sisa.toLocaleString("id-ID");
    sisaEl.style.color = "var(--red)";
    menuDesc.textContent = "Sisa Rp " + data.sisa.toLocaleString("id-ID");
  } else if (data.total > 0) {
    sisaEl.textContent = "Lunas";
    sisaEl.style.color = "var(--green)";
    menuDesc.textContent = "Lunas";
  } else {
    sisaEl.textContent = "Rp 0";
    sisaEl.style.color = "var(--text-secondary)";
    menuDesc.textContent = "Belum ada denda";
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

function showGantiEkskul() {
  if (!currentStudent) return;
  if (studentStatusData?.studentStatus !== "pending") {
    showStudentToast("Hanya bisa ganti saat menunggu konfirmasi", "error");
    return;
  }

  dashboardScreen.style.display = "none";
  pilihEkskulScreen.style.display = "flex";

  showStudentLoading(true);
  try {
    fetch(API_URL + "?action=getEkstraList")
      .then(res => res.json())
      .then(data => {
        if (data.status === "ok") {
          ekstraOptions = data.data || [];
          renderEkstraList();
        }
      });
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

function goToDashboard() {
  if (!currentStudent) return;
  studentLoginScreen.style.display = "none";
  dashboardScreen.style.display = "flex";
  headerGreeting.textContent = "";          // ← blank, no "Halo..."
  
  document.getElementById("studentInfoName").textContent = currentStudent.nama;
  document.getElementById("studentInfoClass").textContent = currentStudent.kelas;
  
  loadStudentStatus();
  loadStudentDebt();
}

// ============================================
// STUDENT: DEBT
// ============================================
async function loadStudentDebt() {
  if (!currentStudent) return;
  
  try {
    const res = await fetch(API_URL + "?action=getStudentDebt&nama=" + encodeURIComponent(currentStudent.nama));
    const data = await res.json();
    
    if (data.status === "ok") {
      renderDebtCard(data);
    }
  } catch (err) {
    console.error("Debt load failed:", err);
  }
}

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

// Update backToDashboard to also hide dendaScreen
function backToDashboard() {
  pilihEkskulScreen.style.display = "none";
  pilihEkskulListScreen.style.display = "none";
  kehadiranScreen.style.display = "none";
  peminatanScreen.style.display = "none";
  document.getElementById("dendaScreen").style.display = "none"; // ← ADD THIS
  dashboardScreen.style.display = "flex";
  selectedEkstra = null;
  ekstraDetailBar.style.display = "none";
  loadStudentStatus();
  loadStudentDebt(); // refresh
}

// ============================================
// STUDENT: SYARAT KHUSUS
// ============================================
async function loadStudentSyarat(ekstra) {
  if (!currentStudent || !ekstra) return;
  try {
    const res = await fetch(API_URL + "?action=getSyaratStudents&ekstra=" + encodeURIComponent(ekstra));
    const data = await res.json();
    if (data.status === "ok") {
      const me = data.data.find(s => s.nama === currentStudent.nama);
      const syarat = me ? me.syarat : "BELUM";
      currentSyaratStatus = syarat;
      updateSyaratUI(syarat);
      updateValidationNotice();
    }
  } catch (err) {
    console.error("Syarat load failed:", err);
  }
}

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

  // Only show when both debt and syarat data have loaded
  if (currentSyaratStatus === null || currentDebtSisa === null) {
    notice.style.display = "none";
    return;
  }

  notice.style.display = "block";

  if (currentSyaratStatus === "SUDAH" && currentDebtSisa === 0) {
    notice.textContent = "Bagus kamu bisa validasi ekskul";
    notice.className = "validation-notice success";
  } else {
    notice.textContent = "Syarat validasi belum terpenuhi";
    notice.className = "validation-notice warning";
  }
}

function resetSyaratUI() {
  currentSyaratStatus = null;
  currentDebtSisa = null;

  const syaratEl = document.getElementById("infoBarSyarat");
  const syaratMenuDesc = document.getElementById("syaratMenuDesc");
  const syaratMenuIcon = document.getElementById("syaratMenuIcon");
  const syaratMenuBtn = document.getElementById("syaratMenuBtn");
  const notice = document.getElementById("validationNotice");

  if (syaratEl) syaratEl.textContent = "-";
  if (syaratMenuDesc) syaratMenuDesc.textContent = "-";
  if (syaratMenuIcon) syaratMenuIcon.textContent = "📋";
  if (syaratMenuBtn) {
    syaratMenuBtn.style.borderColor = "";
    syaratMenuBtn.style.background = "";
  }
  if (notice) notice.style.display = "none";
}


// ============================================
// STUDENT: EVENT LISTENERS
// ============================================
document.addEventListener("click", (e) => {
  if (!e.target.closest(".student-search-box")) {
    searchSuggestions.style.display = "none";
  }
});