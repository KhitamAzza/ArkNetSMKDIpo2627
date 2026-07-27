// ============================================
// ADMIN: LOGIN
// ============================================
function openAdminLogin() {
  adminLoginModal.classList.add("visible");
  setTimeout(() => adminPassword.focus(), 100);
}

function closeAdminLogin() {
  adminLoginModal.classList.remove("visible");
  adminPassword.value = "";
}

function doAdminLogin() {
  const input = adminPassword.value.trim();
  if (input === ADMIN_PASSWORD) {
    closeAdminLogin();
    landingScreen.style.display = "none";
    fabAdmin.style.display = "none";
    adminDashboard.style.display = "flex";
    loadAdminDashboard();
  } else {
    showStudentToast("Password admin salah", "error");
    adminPassword.value = "";
    adminPassword.focus();
  }
}

adminPassword.addEventListener("input", () => {
  const input = adminPassword.value.trim();
  if (input === ADMIN_PASSWORD) {
    doAdminLogin();
  }
});

function adminLogout() {
  adminDashboard.style.display = "none";
  adminBerisikoScreen.style.display = "none";
  adminPerKelasScreen.style.display = "none";
  adminKelasDetailScreen.style.display = "none";
  adminPerEkskulScreen.style.display = "none";
  adminEkstraDetailScreen.style.display = "none";
  landingScreen.style.display = "flex";
  fabAdmin.style.display = "flex";
  adminPassword.value = "";
}

function backToAdminDashboard() {
  adminBerisikoScreen.style.display = "none";
  adminPerKelasScreen.style.display = "none";
  adminPerEkskulScreen.style.display = "none";
  adminDashboard.style.display = "flex";
}

// ============================================
// ADMIN: DASHBOARD
// ============================================
let adminDataCache = null;

async function loadAdminDashboard() {
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getAdminDashboard");
    const data = await res.json();
    if (data.status === "ok") {
      adminDataCache = data;
      renderAdminStats(data);
      updateAdminBadges(data);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderAdminStats(data) {
  const total = data.totalStudents || 0;
  const classes = data.totalClasses || 0;
  const ekstras = data.totalEkstras || 0;
  const noEkskul = data.noEkskul || 0;

  adminStats.innerHTML = `
    <div class="admin-stat-card">
      <div class="admin-stat-value">${total}</div>
      <div class="admin-stat-label">Total Siswa</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-value">${classes}</div>
      <div class="admin-stat-label">Kelas Aktif</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-value">${ekstras}</div>
      <div class="admin-stat-label">Ekskul Aktif</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-value" style="color:var(--red);">${noEkskul}</div>
      <div class="admin-stat-label">Belum Daftar</div>
    </div>
    <div class="admin-stat-card" style="opacity:0;"></div>
    <div class="admin-stat-card" style="opacity:0;"></div>
  `;
}

function updateAdminBadges(data) {
  const alerts = data.alerts || [];
  berisikoBadge.textContent = alerts.length;
  berisikoBadge.style.display = alerts.length > 0 ? "flex" : "none";

  const classes = data.classes || [];
  kelasBadge.textContent = classes.length;
  kelasBadge.style.display = classes.length > 0 ? "flex" : "none";

  const ekstras = data.ekstras || [];
  ekstraBadge.textContent = ekstras.length;
  ekstraBadge.style.display = ekstras.length > 0 ? "flex" : "none";
}

// ============================================
// ADMIN: SISWA BERISIKO
// ============================================
function showAdminBerisiko() {
  adminDashboard.style.display = "none";
  adminBerisikoScreen.style.display = "flex";
  renderAdminBerisikoList();
}

function renderAdminBerisikoList() {
  const container = adminBerisikoList;
  container.innerHTML = "";

  if (!adminDataCache || !adminDataCache.alerts || adminDataCache.alerts.length === 0) {
    container.innerHTML = `<div class="admin-empty">✓ Tidak ada siswa berisiko</div>`;
    return;
  }

  adminDataCache.alerts.forEach(a => {
    const div = document.createElement("div");
    div.className = "admin-list-item " + a.level;

    const badgeClass = a.level;
    const badgeText = a.level === "danger" ? "Berisiko"
                    : a.level === "warning" ? "Peringatan"
                    : "Info";

    const meta = a.ekstra ? `${a.ekstra} • ${a.reason}` : a.reason;

    div.innerHTML = `
      <div class="admin-list-avatar">👤</div>
      <div class="admin-list-info">
        <div class="admin-list-name">${a.nama}</div>
        <div class="admin-list-meta">${meta}</div>
      </div>
      <div class="admin-list-badge ${badgeClass}">${badgeText}</div>
    `;
    container.appendChild(div);
  });
}

// ============================================
// ADMIN: PER KELAS
// ============================================
function showAdminPerKelas() {
  adminDashboard.style.display = "none";
  adminPerKelasScreen.style.display = "flex";
  renderAdminKelasList();
}

function renderAdminKelasList() {
  const container = adminKelasList;
  container.innerHTML = "";

  if (!adminDataCache || !adminDataCache.classes || adminDataCache.classes.length === 0) {
    container.innerHTML = `<div class="admin-empty">Tidak ada data kelas</div>`;
    return;
  }

  adminDataCache.classes.forEach(c => {
    const div = document.createElement("div");
    div.className = "admin-list-item";
    div.onclick = () => showAdminKelasDetail(c);

        div.innerHTML = `
      <div class="admin-list-info">
        <div class="admin-list-name">${c.kelas}</div>
        <div class="admin-list-meta">${c.total} siswa • ${c.noEkskul} Tidak memiliki ekskul</div>
      </div>
      <div class="admin-list-count">${c.total}</div>
    `;
    container.appendChild(div);
  });
}

function showAdminKelasDetail(c) {
  adminPerKelasScreen.style.display = "none";
  adminKelasDetailScreen.style.display = "flex";
  adminKelasDetailTitle.textContent = c.kelas;
  adminKelasDetailTag.textContent = `${c.total} siswa • Wali: ${getWaliKelasName(c.kelas)}`;

  // Fetch class detail
  loadAdminKelasDetail(c.kelas);
}

function getWaliKelasName(kelas) {
  const teacher = TEACHERS.find(t => t.kelas === kelas);
  return teacher ? teacher.nama.split(",")[0] : "-";
}

async function loadAdminKelasDetail(kelas) {
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getClassRegistrationSummary&kelas=" + encodeURIComponent(kelas));
    const data = await res.json();
    if (data.status === "ok") {
      renderAdminKelasDetailList(data.data || []);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderAdminKelasDetailList(students) {
  const container = adminKelasDetailList;
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div class="admin-empty">Tidak ada data siswa</div>`;
    return;
  }

  const order = { none: 0, expelled: 1, rejected: 2, pending: 3, accepted: 4 };
  const sorted = [...students].sort((a, b) => order[a.status] - order[b.status]);

  sorted.forEach(s => {
    const div = document.createElement("div");
    div.className = "admin-list-item " + (s.status === "none" ? "danger" : s.status === "accepted" ? "info" : "warning");

        const statusText = s.status === "accepted" ? "Diterima"
                     : s.status === "pending" ? "Menunggu"
                     : "Tidak memiliki ekskul";

    div.innerHTML = `
      <div class="admin-list-avatar">👤</div>
      <div class="admin-list-info">
        <div class="admin-list-name">${s.nama}</div>
        <div class="admin-list-meta">${s.message || statusText}</div>
      </div>
      <div class="admin-list-badge ${s.status === 'none' ? 'danger' : s.status === 'accepted' ? 'info' : 'warning'}">${statusText}</div>
    `;
    container.appendChild(div);
  });
}

function backToAdminPerKelas() {
  adminKelasDetailScreen.style.display = "none";
  adminPerKelasScreen.style.display = "flex";
}

// ============================================
// ADMIN: PER EKSKUL
// ============================================
function showAdminPerEkskul() {
  adminDashboard.style.display = "none";
  adminPerEkskulScreen.style.display = "flex";
  renderAdminEkstraList();
}

function renderAdminEkstraList() {
  const container = adminEkstraList;
  container.innerHTML = "";

  if (!adminDataCache || !adminDataCache.ekstras || adminDataCache.ekstras.length === 0) {
    container.innerHTML = `<div class="admin-empty">Tidak ada data ekskul</div>`;
    return;
  }

  adminDataCache.ekstras.forEach(e => {
    const div = document.createElement("div");
    div.className = "admin-list-item";
    div.onclick = () => showAdminEkstraDetail(e);

    div.innerHTML = `
      <div class="admin-list-info">
        <div class="admin-list-name">${e.ekstra}</div>
        <div class="admin-list-meta">${e.count} anggota${e.pending > 0 ? ` • ${e.pending} pending` : ''}</div>
      </div>
      <div class="admin-list-count" style="color:var(--green);">${e.count}</div>
    `;
    container.appendChild(div);
  });
}

function showAdminEkstraDetail(e) {
  adminPerEkskulScreen.style.display = "none";
  adminEkstraDetailScreen.style.display = "flex";
  adminEkstraDetailTitle.textContent = e.ekstra;
  adminEkstraDetailTag.textContent = `${e.count} anggota${e.pending > 0 ? ` • ${e.pending} menunggu konfirmasi` : ''}`;

  loadAdminEkstraDetail(e.ekstra);
}

async function loadAdminEkstraDetail(ekstra) {
  showStudentLoading(true);
  try {
    const res = await fetch(API_URL + "?action=getDaftarSiswa&ekstra=" + encodeURIComponent(ekstra));
    const data = await res.json();
    if (data.status === "ok") {
      renderAdminEkstraDetailList(data.data || []);
    } else {
      showStudentToast(data.message || "Gagal memuat data", "error");
    }
  } catch (err) {
    showStudentToast("Error koneksi", "error");
  }
  showStudentLoading(false);
}

function renderAdminEkstraDetailList(students) {
  const container = adminEkstraDetailList;
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div class="admin-empty">Tidak ada anggota</div>`;
    return;
  }

  students.forEach(s => {
    const div = document.createElement("div");
    div.className = "admin-list-item info";

    const hadir = s.stats.HADIR || 0;
    const total = s.stats.totalDays || 1;
    const pct = Math.round((hadir / total) * 100);

    div.innerHTML = `
      <div class="admin-list-avatar">👤</div>
      <div class="admin-list-info">
        <div class="admin-list-name">${s.nama}</div>
        <div class="admin-list-meta">${s.kelas} • Kehadiran ${pct}%</div>
      </div>
      <div class="admin-list-badge info">${pct}%</div>
    `;
    container.appendChild(div);
  });
}

function backToAdminPerEkskul() {
  adminEkstraDetailScreen.style.display = "none";
  adminPerEkskulScreen.style.display = "flex";
}
