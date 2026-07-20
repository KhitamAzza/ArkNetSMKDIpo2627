// ============================================
// TEACHER: LOGIN
// ============================================
function doGuruLogin() {
  const input = guruPassword.value.trim();
  if (!input) {
    showStudentToast("Password wajib diisi", "error");
    return;
  }

  const teacher = TEACHERS.find(t => t.password === input);
  if (!teacher) {
    showStudentToast("Password salah", "error");
    guruPassword.value = "";
    guruPassword.focus();
    return;
  }

  currentGuru = teacher;
  guruLoginScreen.style.display = "none";
  guruDashboard.style.display = "flex";

  guruHeaderName.textContent = teacher.nama.split(",")[0];
  guruClassTag.textContent = "Wali Kelas " + teacher.kelas;

  loadGuruDashboard();
}

function guruLogout() {
  backToLanding();
}

// ============================================
// TEACHER: DASHBOARD
// ============================================
function loadGuruDashboard() {
  if (!currentGuru) return;
  guruHeaderName.textContent = currentGuru.nama.split(",")[0];
  guruClassTag.textContent = "Wali Kelas " + currentGuru.kelas;
  loadGuruAlerts();
  loadValidationReady();
}


function backToGuruDashboard() {
  document.getElementById("guruDataEkskulScreen").style.display = "none";
  guruDashboard.style.display = "flex";
}

// ============================================
// TEACHER: DATA EKSKUL KELAS
// ============================================
async function showDataEkskulKelas() {
  if (!currentGuru) return;
  guruDashboard.style.display = "none";
  document.getElementById("guruDataEkskulScreen").style.display = "flex";
  document.getElementById("guruDataClassTag").textContent = "Wali Kelas " + currentGuru.kelas;

  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getClassStudentsWithAttendance&kelas=" + encodeURIComponent(currentGuru.kelas));
    const data = await res.json();
    if (data.status === "ok") {
      renderDataEkskulList(data.data || []);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderDataEkskulList(students) {
  const container = document.getElementById("guruDataStudentList");
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:32px;">Tidak ada data siswa</div>`;
    return;
  }

  students.forEach(s => {
    const hasEkskul = s.ekstra && s.ekstra !== "0";
    const total = s.stats.totalDays || 0;

    const card = document.createElement("div");
    card.className = "guru-student-card";
    card.onclick = () => card.classList.toggle("expanded");

    // Background attendance bar
    let bgBar = "";
    if (hasEkskul && total > 0) {
      const hadirPct = ((s.stats.HADIR / total) * 100).toFixed(1);
      const alphaPct = ((s.stats.ALPHA / total) * 100).toFixed(1);
      const terlambatPct = ((s.stats.TERLAMBAT / total) * 100).toFixed(1);
      const pagiPct = ((s.stats.PAGI / total) * 100).toFixed(1);
      const otherPct = Math.max(0, (100 - parseFloat(hadirPct) - parseFloat(alphaPct) - parseFloat(terlambatPct) - parseFloat(pagiPct))).toFixed(1);

      bgBar = `
        <div class="guru-student-bg-bar">
          ${s.stats.HADIR > 0 ? `<div class="bg-segment status-hadir" style="width:${hadirPct}%"></div>` : ''}
          ${s.stats.ALPHA > 0 ? `<div class="bg-segment status-alpha" style="width:${alphaPct}%"></div>` : ''}
          ${s.stats.TERLAMBAT > 0 ? `<div class="bg-segment status-terlambat" style="width:${terlambatPct}%"></div>` : ''}
          ${s.stats.PAGI > 0 ? `<div class="bg-segment status-pagi" style="width:${pagiPct}%"></div>` : ''}
          ${parseFloat(otherPct) > 0 ? `<div class="bg-segment status-other" style="width:${otherPct}%"></div>` : ''}
        </div>
      `;
    } else {
      bgBar = `<div class="guru-student-bg-bar no-ekstra"></div>`;
    }

    // Photo
    const photoHtml = s.foto
      ? `<img class="guru-student-photo" src="${s.foto}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="guru-student-photo-placeholder" style="display:none;">👤</div>`
      : `<div class="guru-student-photo-placeholder">👤</div>`;

    // Ekskul text
    const ekstraHtml = hasEkskul
      ? `<div class="guru-student-ekstra">${s.ekstra}</div>`
      : `<div class="guru-student-ekstra no-ekstra-text">belum terdaftar di Ekskul</div>`;

    // Daily attendance grid
    let attendanceHtml = "";
    if (s.attendance && s.attendance.length > 0) {
      attendanceHtml = s.attendance.map(day => {
        let colorClass = "status-other";
        const st = day.statusUpper;
        if (st === "HADIR") colorClass = "status-hadir";
        else if (st === "ALPHA") colorClass = "status-alpha";
        else if (st === "TERLAMBAT") colorClass = "status-terlambat";
        else if (st === "PAGI") colorClass = "status-pagi";

        return `<div class="attendance-day ${colorClass}"><span class="attendance-date">${day.date}</span><span class="attendance-status">${day.status || '-'}</span></div>`;
      }).join('');
    } else {
      attendanceHtml = `<div style="color:var(--text-secondary);font-size:12px;padding:8px 0;">Belum ada data kehadiran</div>`;
    }

    card.innerHTML = `
      ${bgBar}
      <div class="guru-student-content">
        <div class="guru-student-main">
          <div class="guru-student-name">${s.nama}</div>
          ${ekstraHtml}
        </div>
        ${photoHtml}
      </div>
      <div class="guru-student-expand">
        <div class="attendance-grid">${attendanceHtml}</div>
      </div>
    `;

    container.appendChild(card);
  });
}

// ============================================
// AUTOLOGIN LISTENER
// ============================================
guruPassword.addEventListener("input", () => {
  const input = guruPassword.value.trim();
  if (TEACHERS.find(t => t.password === input)) {
    doGuruLogin();
  }
});

// ============================================
// TEACHER: ALERTS / PEMBERITAHUAN
// ============================================
let guruAlertsExpanded = false;
let guruAlertsData = null;

async function loadGuruAlerts() {
  if (!currentGuru) return;
  const summary = document.getElementById("guruAlertSummary");
  summary.textContent = "Memuat...";

  try {
    const res = await fetch(API_URL + "?action=getClassAlerts&kelas=" + encodeURIComponent(currentGuru.kelas));
    const data = await res.json();
    if (data.status === "ok") {
      guruAlertsData = data;
      renderGuruAlertSummary(data);
    } else {
      summary.textContent = "Gagal memuat pemberitahuan";
    }
  } catch (err) {
    summary.textContent = "Error memuat pemberitahuan";
  }
}

function renderGuruAlertSummary(data) {
  const summary = document.getElementById("guruAlertSummary");
  const c = data.counts || {};
  const parts = [];

  if (c.belumDaftar > 0) parts.push(`🔴 ${c.belumDaftar} belum daftar ekskul`);
  if (c.alphaTinggi > 0) parts.push(`🟡 ${c.alphaTinggi} Alpha tinggi`);
  if (c.pendingLama > 0) parts.push(`🔵 ${c.pendingLama} menunggu konfirmasi`);
    if (c.expelled > 0) parts.push(`🔴 ${c.expelled} dikeluarkan`);

  if (parts.length === 0) {
    summary.innerHTML = `<span style="color:var(--green);">✓ Semua siswa dalam kondisi baik</span>`;
  } else {
    summary.innerHTML = parts.join(" &nbsp;•&nbsp; ");
  }
}

function toggleGuruAlerts() {
  if (!guruAlertsData) return;
  guruAlertsExpanded = !guruAlertsExpanded;

  const detail = document.getElementById("guruAlertDetail");
  const toggle = document.getElementById("guruAlertToggle");

  if (guruAlertsExpanded) {
    renderGuruAlertDetail(guruAlertsData);
    detail.style.display = "flex";
    toggle.textContent = "Sembunyikan ▲";
  } else {
    detail.style.display = "none";
    toggle.textContent = "Lihat detail ▼";
  }
}

function renderGuruAlertDetail(data) {
  const detail = document.getElementById("guruAlertDetail");
  detail.innerHTML = "";

  const a = data.alerts || {};
  const hasAny = a.belumDaftar?.length || a.alphaTinggi?.length || a.pendingLama?.length;

  if (!hasAny) {
    detail.innerHTML = `<div class="guru-alert-empty">✓ Tidak ada masalah saat ini</div>`;
    return;
  }

  if (a.belumDaftar?.length > 0) {
    const g = document.createElement("div");
    g.className = "alert-group";
    g.innerHTML = `<div class="alert-group-title red">Belum Daftar Ekskul (${a.belumDaftar.length})</div>`;
    a.belumDaftar.forEach(s => {
      g.innerHTML += `
        <div class="alert-item">
          <div class="alert-item-dot red"></div>
          <div class="alert-item-name">${s.nama}</div>
          <div class="alert-item-meta">Belum mendaftar</div>
        </div>`;
    });
    detail.appendChild(g);
  }

  if (a.alphaTinggi?.length > 0) {
    const g = document.createElement("div");
    g.className = "alert-group";
    g.innerHTML = `<div class="alert-group-title yellow">Alpha Tinggi (${a.alphaTinggi.length})</div>`;
    a.alphaTinggi.forEach(s => {
      g.innerHTML += `
        <div class="alert-item">
          <div class="alert-item-dot yellow"></div>
          <div class="alert-item-name">${s.nama}</div>
          <div class="alert-item-meta">${s.alphaCount} hari Alpha${s.ekstra ? ' • ' + s.ekstra : ''}</div>
        </div>`;
    });
    detail.appendChild(g);
  }

  if (a.pendingLama?.length > 0) {
    const g = document.createElement("div");
    g.className = "alert-group";
    g.innerHTML = `<div class="alert-group-title blue">Menunggu Konfirmasi (${a.pendingLama.length})</div>`;
    a.pendingLama.forEach(s => {
      g.innerHTML += `
        <div class="alert-item">
          <div class="alert-item-dot blue"></div>
          <div class="alert-item-name">${s.nama}</div>
          <div class="alert-item-meta">${s.ekstra}</div>
        </div>`;
    });
    detail.appendChild(g);
  }
    if (a.expelled?.length > 0) {
    const g = document.createElement("div");
    g.className = "alert-group";
    g.innerHTML = `<div class="alert-group-title expelled">Dikeluarkan dari Ekskul (${a.expelled.length})</div>`;
    a.expelled.forEach(s => {
      g.innerHTML += `
        <div class="alert-item">
          <div class="alert-item-dot expelled"></div>
          <div class="alert-item-name">${s.nama}</div>
          <div class="alert-item-meta">${s.ekstra}</div>
        </div>`;
    });
    detail.appendChild(g);
  }
}
// ============================================
// TEACHER: REKAP PENDAFTARAN
// ============================================
function showRekapPendaftaran() {
  if (!currentGuru) return;
  guruDashboard.style.display = "none";
  document.getElementById("guruRekapScreen").style.display = "flex";
  document.getElementById("guruRekapClassTag").textContent = "Wali Kelas " + currentGuru.kelas;
  loadRekapPendaftaran();
}

function backToGuruDashboardFromRekap() {
  document.getElementById("guruRekapScreen").style.display = "none";
  guruDashboard.style.display = "flex";
}

async function loadRekapPendaftaran() {
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getClassRegistrationSummary&kelas=" + encodeURIComponent(currentGuru.kelas));
    const data = await res.json();
    if (data.status === "ok") {
      renderRekapList(data.data || []);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderRekapList(students) {
  const container = document.getElementById("guruRekapList");
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:32px;">Tidak ada data siswa</div>`;
    return;
  }

  // Sort: none → expelled → rejected → pending → accepted
  const order = { none: 0, expelled: 1, rejected: 2, pending: 3, accepted: 4 };
  const sorted = [...students].sort((a, b) => order[a.status] - order[b.status]);

  sorted.forEach(s => {
    const div = document.createElement("div");
    div.className = "guru-rekap-item " + s.status;

    const statusClass = "guru-rekap-status " + s.status;
    const message = s.message || "Belum memilih ekskul";

    div.innerHTML = `
            ${s.foto
        ? `<img class="guru-student-photo" src="${s.foto}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="guru-student-photo-placeholder" style="display:none;">👤</div>`
        : `<div class="guru-student-photo-placeholder">👤</div>`
      }
      <div class="guru-rekap-info">
        <div class="guru-rekap-name">${s.nama}</div>
        <div class="${statusClass}">${message}</div>
      </div>
    `;
    container.appendChild(div);
  });
}
// ============================================
// FAB WHATSAPP
// ============================================
let fabExpanded = false;

function toggleFab() {
  fabExpanded = !fabExpanded;
  document.getElementById("fabOptions").classList.toggle("visible", fabExpanded);
  document.getElementById("fabMain").classList.toggle("expanded", fabExpanded);
}

function closeFab() {
  fabExpanded = false;
  document.getElementById("fabOptions").classList.remove("visible");
  document.getElementById("fabMain").classList.remove("expanded");
}

// Close FAB when tapping outside
document.addEventListener("click", (e) => {
  if (fabExpanded && !e.target.closest(".fab-container")) {
    closeFab();
  }
});

function openWhatsApp(text) {
  const encoded = encodeURIComponent(text);
  window.open("https://wa.me/?text=" + encoded, "_blank");
}

// --- 1. Kirim Kehadiran ---
async function shareKehadiranWA() {
  closeFab();
  if (!currentGuru) return;
  showStudentLoading(true);

  try {
    const res = await fetch(API_URL + "?action=getClassStudentsWithAttendance&kelas=" + encodeURIComponent(currentGuru.kelas));
    const data = await res.json();
    if (data.status !== "ok") {
      showStudentToast("Gagal memuat data kehadiran", "error");
      return;
    }

    const students = data.data || [];
    const groups = {};

    students.forEach(s => {
      const total = s.stats.totalDays || 0;
      const hadir = s.stats.HADIR || 0;
      const pct = total > 0 ? Math.round((hadir / total) * 100) : 0;
      if (!groups[pct]) groups[pct] = [];
      groups[pct].push(s);
    });

    const sortedPcts = Object.keys(groups).map(Number).sort((a, b) => b - a);

    let msg = `*Prosentase kehadiran kelas ${currentGuru.kelas}*\n\n`;
    sortedPcts.forEach(pct => {
      msg += `*Kehadiran ${pct}%*\n`;
      groups[pct].forEach(s => {
        const hasEkskul = s.ekstra && s.ekstra !== "0";
                msg += hasEkskul ? `${s.nama} - ${s.ekstra}\n` : `${s.nama} (tidak terdaftar ekskul)\n`;
      });
      msg += `\n`;
    });

    openWhatsApp(msg);
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

// --- 2. Kirim Rekap Ekskul ---
async function shareRekapWA() {
  closeFab();
  if (!currentGuru) return;
  showStudentLoading(true);

  try {
    const res = await fetch(API_URL + "?action=getClassRegistrationSummary&kelas=" + encodeURIComponent(currentGuru.kelas));
    const data = await res.json();
    if (data.status !== "ok") {
      showStudentToast("Gagal memuat data rekap", "error");
      return;
    }

    const students = data.data || [];
    const accepted = students.filter(s => s.status === "accepted");
    const pending  = students.filter(s => s.status === "pending");
    const rejected = students.filter(s => s.status === "rejected");
    const expelled = students.filter(s => s.status === "expelled");
    const none     = students.filter(s => s.status === "none");

    let msg = `*Rekap pendaftaran ekskul kelas ${currentGuru.kelas}*\n\n`;

        if (accepted.length) {
      msg += `*Siswa sudah diterima ekskul*\n`;
      accepted.forEach(s => msg += `${s.nama} - ${s.ekstra}\n`);
      msg += `\n`;
    }
    if (pending.length) {
      msg += `*Siswa sudah mendaftar ekskul*\n`;
      pending.forEach(s => msg += `${s.nama} - ${s.ekstra}\n`);
      msg += `\n`;
    }
    if (rejected.length) {
      msg += `*Siswa ditolak ekskul*\n`;
      rejected.forEach(s => msg += `${s.nama} - ${s.ekstra}\n`);
      msg += `\n`;
    }
    if (expelled.length) {
      msg += `*Siswa dikeluarkan ekskul*\n`;
      expelled.forEach(s => msg += `${s.nama} - ${s.ekstra}\n`);
      msg += `\n`;
    }
    if (none.length) {
      msg += `*Siswa belum memilih ekskul*\n`;
      none.forEach(s => msg += `${s.nama}\n`);
      msg += `\n`;
    }

    openWhatsApp(msg);
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

// --- 3. Kirim Rekap Denda (placeholder) ---
function shareDendaWA() {
  closeFab();
  showStudentToast("Fitur rekap denda segera hadir", "info");
}
// ============================================
// TEACHER: REKAP DENDA
// ============================================
function showRekapDenda() {
  if (!currentGuru) return;
  guruDashboard.style.display = "none";
  document.getElementById("guruRekapDendaScreen").style.display = "flex";
  document.getElementById("guruDendaClassTag").textContent = "Wali Kelas " + currentGuru.kelas;
  loadRekapDenda();
}

function backToGuruDashboardFromDenda() {
  document.getElementById("guruRekapDendaScreen").style.display = "none";
  guruDashboard.style.display = "flex";
}

async function loadRekapDenda() {
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getClassDebts&kelas=" + encodeURIComponent(currentGuru.kelas));
    const data = await res.json();
    if (data.status === "ok") {
      renderRekapDendaList(data.data || []);
    } else {
      showStudentToast(data.message || "Gagal memuat data denda", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderRekapDendaList(students) {
  const container = document.getElementById("guruDendaStudentList");
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:32px;">Tidak ada data denda</div>`;
    return;
  }

  // Sort by sisa descending (highest debt first)
  const sorted = [...students].sort((a, b) => b.sisa - a.sisa);

  sorted.forEach(s => {
    const hasDebt = s.sisa > 0;
    const paid = (s.total || 0) - (s.sisa || 0);

    const card = document.createElement("div");
    card.className = "guru-debt-card " + (hasDebt ? "has-debt" : "no-debt");
    card.onclick = () => card.classList.toggle("expanded");

    const badgeText = hasDebt ? "Rp " + s.sisa.toLocaleString("id-ID") : "LUNAS";
    const amountClass = hasDebt ? "has-debt" : "no-debt";

    card.innerHTML = `
      <div class="guru-debt-content">
        <div class="guru-debt-main">
          <div class="guru-debt-name">${s.nama}</div>
          <div class="guru-debt-amount ${amountClass}">
            ${hasDebt ? "Sisa Rp " + s.sisa.toLocaleString("id-ID") : "Tidak ada denda"}
          </div>
        </div>
        <div class="guru-debt-badge ${amountClass}">${badgeText}</div>
      </div>
      <div class="guru-debt-expand">
        <div class="debt-detail-grid">
          <div class="debt-detail-item">
            <div class="debt-detail-value red">Rp ${(s.total || 0).toLocaleString("id-ID")}</div>
            <div class="debt-detail-label">Total Denda</div>
          </div>
          <div class="debt-detail-item">
            <div class="debt-detail-value green">Rp ${paid.toLocaleString("id-ID")}</div>
            <div class="debt-detail-label">Sudah Dibayar</div>
          </div>
          <div class="debt-detail-item">
            <div class="debt-detail-value ${hasDebt ? 'red' : 'green'}">Rp ${(s.sisa || 0).toLocaleString("id-ID")}</div>
            <div class="debt-detail-label">Sisa</div>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// ============================================
// TEACHER: VALIDATION READY (0 debt + syarat SUDAH)
// ============================================
let validationExpanded = false;

async function loadValidationReady() {
  if (!currentGuru) return;
  const summary = document.getElementById("guruValidationSummary");
  const card = document.getElementById("guruValidationCard");
  if (card) card.style.display = "block";
  if (summary) summary.textContent = "Memuat...";

  try {
    const [syaratRes, debtRes] = await Promise.all([
      fetch(API_URL + "?action=getClassSyaratStudents&kelas=" + encodeURIComponent(currentGuru.kelas)),
      fetch(API_URL + "?action=getClassDebts&kelas=" + encodeURIComponent(currentGuru.kelas))
    ]);
    const syaratData = await syaratRes.json();
    const debtData = await debtRes.json();

    let readyStudents = [];
    if (syaratData.status === "ok") {
      const syarats = syaratData.data || [];
      const debtMap = {};
      if (debtData.status === "ok") {
        (debtData.data || []).forEach(d => { debtMap[d.nama] = d.sisa; });
      }

      readyStudents = syarats
        .filter(s => s.syarat === "SUDAH" && (debtMap[s.nama] || 0) === 0)
        .map(s => ({ nama: s.nama }));
    }
    renderValidationReady(readyStudents);
  } catch (err) {
    if (summary) summary.textContent = "Gagal memuat data";
  }
}

function renderValidationReady(students) {
  const summary = document.getElementById("guruValidationSummary");
  const countEl = document.getElementById("guruValidationCount");
  const detail = document.getElementById("guruValidationDetail");

  if (countEl) countEl.textContent = students.length;

  if (students.length === 0) {
    if (summary) summary.innerHTML = `<span style="color:var(--text-secondary);">Belum ada siswa yang memenuhi syarat validasi</span>`;
    if (detail) detail.innerHTML = "";
  } else {
    if (summary) summary.textContent = `${students.length} siswa sudah lunas denda & syarat khusus`;
    if (detail) {
      detail.innerHTML = students.map(s => `
        <div class="alert-item">
          <div class="alert-item-dot green"></div>
          <div class="alert-item-name">${s.nama}</div>
          <div class="alert-item-meta">Siap validasi</div>
        </div>
      `).join('');
    }
  }
}

function toggleValidationReady() {
  validationExpanded = !validationExpanded;
  const detail = document.getElementById("guruValidationDetail");
  if (detail) detail.style.display = validationExpanded ? "flex" : "none";
}

// ============================================
// TEACHER: SYARAT KHUSUS SCREEN
// ============================================
function showSyaratKhusus() {
  if (!currentGuru) return;
  guruDashboard.style.display = "none";
  document.getElementById("guruSyaratScreen").style.display = "flex";
  document.getElementById("guruSyaratClassTag").textContent = "Wali Kelas " + currentGuru.kelas;
  loadSyaratKhusus();
}

function backToGuruDashboardFromSyarat() {
  document.getElementById("guruSyaratScreen").style.display = "none";
  guruDashboard.style.display = "flex";
}

async function loadSyaratKhusus() {
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getClassSyaratStudents&kelas=" + encodeURIComponent(currentGuru.kelas));
    const data = await res.json();
    if (data.status === "ok") {
      renderSyaratList(data.data || []);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderSyaratList(students) {
  const container = document.getElementById("guruSyaratList");
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:32px;">Tidak ada data siswa</div>`;
    return;
  }

  // Sort: BELUM first, then SUDAH, then by name
  const sorted = [...students].sort((a, b) => {
    if (a.syarat === b.syarat) return a.nama.localeCompare(b.nama);
    return a.syarat === "BELUM" ? -1 : 1;
  });

  sorted.forEach(s => {
    const div = document.createElement("div");
    div.className = "guru-syarat-item " + (s.syarat === "SUDAH" ? "sudah" : "belum");

    div.innerHTML = `
      <div class="guru-syarat-info">
        <div class="guru-syarat-name">${s.nama}</div>
        <div class="guru-syarat-ekstra">${s.ekstra || "Belum terdaftar ekskul"}</div>
      </div>
      <div class="guru-syarat-badge ${s.syarat === "SUDAH" ? "sudah" : "belum"}">${s.syarat}</div>
    `;
    container.appendChild(div);
  });
}