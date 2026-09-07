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

  loadTeacherDashboard();
}

function guruLogout() {
  backToLanding();
}

guruPassword.addEventListener("input", () => {
  const input = guruPassword.value.trim();
  if (TEACHERS.find(t => t.password === input)) {
    doGuruLogin();
  }
});

// ============================================
// TEACHER: DASHBOARD (SUPABASE)
// ============================================
let guruClassData = [];
let guruAlertsData = null;
let validationExpanded = false;

async function loadTeacherDashboard() {
  if (!currentGuru) return;
  showStudentLoading(true);

  try {
    // 1. Students in class
    const { data: students, error: sErr } = await sb
      .from('Database')
      .select('id, nama, kelas, ekstra, syarat_khusus, photo_url')
      .eq('kelas', currentGuru.kelas);
    if (sErr) throw sErr;

    const studentIds = students.map(s => s.id);
    if (studentIds.length === 0) {
      guruClassData = [];
      renderTeacherDashboard({ alerts: {}, validationReady: [] });
      showStudentLoading(false);
      return;
    }

    // 2. Fetch attendance, registrations, redemptions, AND payments in parallel
    const [
      { data: attendance, error: attErr },
      { data: registrations, error: regErr },
      { data: redemptions, error: redErr },
      { data: payments, error: payErr }
    ] = await Promise.all([
      sb.from('AttendanceV2').select('student_id, status, date').eq('semester', currentSemester).in('student_id', studentIds),
      sb.from('registrations').select('student_id, status, ekstra, alasan, created_at').in('student_id', studentIds).order('created_at', { ascending: false }),
      sb.from('Redemptions').select('student_id, poin, deskripsi, guru, created_at').eq('semester', currentSemester).in('student_id', studentIds),
      sb.from('bayardenda').select('student_id, amount, submitter, created_at, note').eq('semester', currentSemester).in('student_id', studentIds).order('created_at', { ascending: false })
    ]);

    // Don't fail silently — a bad column/table name here used to just resolve
    // with data: null, which looked like "no data" instead of an error.
    if (attErr) console.error("Teacher dashboard: attendance query failed", attErr);
    if (regErr) console.error("Teacher dashboard: registrations query failed", regErr);
    if (redErr) console.error("Teacher dashboard: redemptions query failed", redErr);
    if (payErr) console.error("Teacher dashboard: payments query failed", payErr);

    const cfg = appConfig || {};
    const dendaAlpha = cfg.denda_alpha ?? 0;
    const dendaLate  = cfg.denda_terlambat ?? 0;
    const minusAlpha = cfg.nilai_minus_alpha ?? -10;
    const minusLate  = cfg.nilai_minus_terlambat ?? -5;
    const pointThreshold = cfg.minus_point_threshold ?? -30;

    // 3. Process each student
    guruClassData = students.map(s => {
      const sAtt = (attendance || []).filter(a => a.student_id === s.id);
      const sReg = (registrations || []).filter(r => r.student_id === s.id);
      const sRed = (redemptions || []).filter(r => r.student_id === s.id);
      const sPay = (payments || []).filter(p => p.student_id === s.id);

      // Attendance stats
      const byDate = {};
      sAtt.forEach(a => {
        if (!byDate[a.date]) byDate[a.date] = [];
        byDate[a.date].push(a);
      });

      const attendanceDays = Object.entries(byDate).map(([date, rows]) => ({
        date,
        status: deriveStatus(rows),
        statusUpper: (deriveStatus(rows) || "-").toUpperCase()
      }));

      const stats = { HADIR: 0, ALPHA: 0, TERLAMBAT: 0, PAGI: 0, TELAT: 0, totalDays: attendanceDays.length };
      attendanceDays.forEach(d => {
        const st = d.statusUpper;
        if (stats[st] !== undefined) stats[st]++;
      });

      // Debt & points
      const alphaCount = stats.ALPHA;
      const lateCount  = stats.TERLAMBAT + stats.TELAT + stats.PAGI;
      const totalDebt  = (alphaCount * dendaAlpha) + (lateCount * dendaLate);
      const paid       = sPay.reduce((sum, p) => sum + (p.amount || 0), 0);
      const sisa       = totalDebt - paid;

      const totalMinus = (alphaCount * minusAlpha) + (lateCount * minusLate);
      const redemptionTotal = sRed.reduce((sum, r) => sum + (r.poin || 0), 0);
      const netPoint = totalMinus + redemptionTotal;

      // Registration status
      const pending  = sReg.find(r => r.status === 'pending');
      const rejected = sReg.filter(r => r.status === 'rejected');
      const expelled = sReg.find(r => r.status === 'expelled');
      const hasDbEkstra = s.ekstra && s.ekstra !== '0' && s.ekstra.trim() !== '';

      let regStatus = 'none';
      let regMessage = 'Belum memilih ekskul';
      let regEkstra = null;

      if (expelled) {
        regStatus = 'expelled';
        regMessage = `Dikeluarkan dari ${expelled.ekstra}`;
        regEkstra = expelled.ekstra;
      } else if (hasDbEkstra) {
        if (pending) {
          regStatus = 'pending';
          regMessage = `Pendaftaran ke ${pending.ekstra} sedang diproses`;
          regEkstra = pending.ekstra;
        } else {
          regStatus = 'accepted';
          regMessage = `Diterima di ${s.ekstra}`;
          regEkstra = s.ekstra;
        }
      } else if (pending) {
        regStatus = 'pending';
        regMessage = `Pendaftaran ke ${pending.ekstra} sedang diproses`;
        regEkstra = pending.ekstra;
      } else if (rejected.length >= 2) {
        regStatus = 'exhausted';
        regMessage = 'Kesempatan pendaftaran sudah habis';
      } else if (rejected.length === 1) {
        regStatus = 'rejected_once';
        regMessage = `Ditolak dari ${rejected[0].ekstra}`;
        regEkstra = rejected[0].ekstra;
      }

      return {
        ...s,
        stats,
        attendanceDays,
        totalDebt,
        paid,
        sisa,
        payments: sPay,
        totalMinus,
        redemptionTotal,
        netPoint,
        regStatus,
        regMessage,
        regEkstra,
        redemptions: sRed,
        hasPending: !!pending,
        hasDebt: sisa > 0,        // ← now based on actual remaining debt
        hasSyaratIssue: (s.syarat_khusus || "BELUM") !== "SUDAH",
        hasMinusPoint: netPoint < pointThreshold,
        alphaCount,
        hasAlpha: alphaCount > 0
      };
    });

    // 4. Build alert buckets
    const alerts = {
      tidakMemilikiEkskul: guruClassData.filter(s => s.regStatus === 'none' || s.regStatus === 'exhausted' || s.regStatus === 'rejected_once'),
      alphaTinggi: guruClassData.filter(s => s.hasAlpha),
      pendingLama: guruClassData.filter(s => s.hasPending),
      adaDenda: guruClassData.filter(s => s.hasDebt),
      belumSyarat: guruClassData.filter(s => s.hasSyaratIssue),
      minusPointRendah: guruClassData.filter(s => s.hasMinusPoint)
    };
    alerts.allCount = guruClassData.filter(s =>
      s.regStatus === 'none' || s.regStatus === 'exhausted' || s.regStatus === 'rejected_once' ||
      s.hasAlpha || s.hasPending || s.hasDebt || s.hasSyaratIssue || s.hasMinusPoint
    ).length;

    // 5. Validation ready
    const validationReady = guruClassData.filter(s =>
      s.regStatus === 'accepted' && !s.hasSyaratIssue && !s.hasDebt && !s.hasMinusPoint
    );

    guruAlertsData = { alerts, validationReady };
    renderTeacherDashboard({ alerts, validationReady });

  } catch (err) {
    console.error(err);
    showStudentToast("Error memuat dashboard guru", "error");
  }

  showStudentLoading(false);
}

function renderTeacherDashboard(data) {
  const { alerts, validationReady } = data;

  // Alert summary line
  const summary = document.getElementById("guruAlertSummary");
  const c = {
    tidakMemilikiEkskul: alerts.tidakMemilikiEkskul.length,
    alphaTinggi: alerts.alphaTinggi.length,
    pendingLama: alerts.pendingLama.length,
    adaDenda: alerts.adaDenda.length,
    belumSyarat: alerts.belumSyarat.length,
    minusPointRendah: alerts.minusPointRendah.length
  };

  const parts = [];
  if (c.tidakMemilikiEkskul > 0) parts.push(`🔴 ${c.tidakMemilikiEkskul} tidak punya ekskul`);
    if (c.alphaTinggi > 0) parts.push(`🟡 ${c.alphaTinggi} Alpha`);
  if (c.pendingLama > 0) parts.push(`🔵 ${c.pendingLama} menunggu`);
  if (c.adaDenda > 0) parts.push(`💰 ${c.adaDenda} ada denda`);
  if (c.belumSyarat > 0) parts.push(`📋 ${c.belumSyarat} belum syarat`);
  if (c.minusPointRendah > 0) parts.push(`📉 ${c.minusPointRendah} minus poin rendah`);

  if (parts.length === 0) {
    summary.innerHTML = `<span style="color:var(--green);">✓ Semua siswa dalam kondisi baik</span>`;
  } else {
    summary.innerHTML = parts.join(" &nbsp;•&nbsp; ");
  }

  // Validation ready card
  const card = document.getElementById("guruValidationCard");
  if (card) {
    card.style.display = validationReady.length > 0 ? "block" : "none";
    renderValidationReady(validationReady);
  }
}

// ============================================
// TEACHER: ALERTS (TABBED DETAIL)
// ============================================
let guruAlertsExpanded = false;

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

  const { alerts } = data;
    const tabs = [
    { key: 'all', label: `Semua (${alerts.allCount})` },
    { key: 'alpha', label: `Alpha (${alerts.alphaTinggi.length})` },
    { key: 'pending', label: `Menunggu (${alerts.pendingLama.length})` },
    { key: 'denda', label: `Denda (${alerts.adaDenda.length})` },
    { key: 'syarat', label: `Syarat (${alerts.belumSyarat.length})` },
    { key: 'point', label: `Minus Poin (${alerts.minusPointRendah.length})` }
  ];

  let activeTab = 'all';

  const tabBar = document.createElement("div");
  tabBar.style.cssText = "display:flex;gap:8px;padding:0 0 12px;overflow-x:auto;border-bottom:1px solid var(--border);margin-bottom:12px;";

  const listContainer = document.createElement("div");
  listContainer.style.cssText = "display:flex;flex-direction:column;gap:8px;";

  function renderList(key) {
    listContainer.innerHTML = "";
    let items = [];

    if (key === 'all') {
      const map = new Map();
      const add = (arr, problem) => arr.forEach(s => {
        if (!map.has(s.id)) map.set(s.id, { ...s, problems: [] });
        const existing = map.get(s.id);
        if (!existing.problems.includes(problem)) existing.problems.push(problem);
      });
      add(alerts.tidakMemilikiEkskul, 'tidak punya ekskul');
            add(alerts.alphaTinggi, 'ada alpha');
      add(alerts.pendingLama, 'menunggu');
      add(alerts.adaDenda, 'ada denda');
      add(alerts.belumSyarat, 'belum syarat');
      add(alerts.minusPointRendah, 'minus poin rendah');
      items = Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama));
          } else if (key === 'alpha') {
      items = alerts.alphaTinggi.map(s => ({ ...s, problems: [`${s.alphaCount}x alpha`] }));
    } else if (key === 'pending') {
      items = alerts.pendingLama.map(s => ({ ...s, problems: ['menunggu konfirmasi'] }));
    } else if (key === 'denda') {
      items = alerts.adaDenda.map(s => ({ ...s, problems: [`denda Rp ${s.totalDebt.toLocaleString('id-ID')}`] }));
    } else if (key === 'syarat') {
      items = alerts.belumSyarat.map(s => ({ ...s, problems: ['belum syarat khusus'] }));
    } else if (key === 'point') {
      items = alerts.minusPointRendah.map(s => ({ ...s, problems: [`minus poin ${s.netPoint}`] }));
    }

    if (items.length === 0) {
      listContainer.innerHTML = `<div class="guru-alert-empty">✓ Tidak ada masalah di kategori ini</div>`;
      return;
    }

    items.forEach(s => {
      const div = document.createElement("div");
      div.className = "alert-item";
      const dotColor = s.regStatus === 'expelled' ? 'var(--red)' : (s.regStatus === 'pending' ? 'var(--accent)' : 'var(--yellow)');
      const tags = s.problems.map(p =>
        `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--border);color:var(--text-secondary);white-space:nowrap;">${p}</span>`
      ).join(' ');

      div.innerHTML = `
        <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;margin-bottom:2px;">${s.nama}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${tags}</div>
        </div>
      `;
      listContainer.appendChild(div);
    });
  }

  tabs.forEach(t => {
    const btn = document.createElement("button");
    btn.textContent = t.label;
    btn.style.cssText = "padding:6px 14px;border-radius:20px;border:none;background:var(--card);color:var(--text-secondary);font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;flex-shrink:0;transition:all 0.15s;";
    if (t.key === activeTab) {
      btn.style.background = "var(--accent)";
      btn.style.color = "#fff";
    }
        btn.onclick = (e) => {
      e.stopPropagation(); // ← prevents parent card from collapsing
      activeTab = t.key;
      tabBar.querySelectorAll("button").forEach(b => {
        b.style.background = "var(--card)";
        b.style.color = "var(--text-secondary)";
      });
      btn.style.background = "var(--accent)";
      btn.style.color = "#fff";
      renderList(activeTab);
    };
    tabBar.appendChild(btn);
  });

  detail.appendChild(tabBar);
  detail.appendChild(listContainer);
  renderList('all');
}

// ============================================
// TEACHER: VALIDATION READY
// ============================================
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
// TEACHER: DATA EKSKUL KELAS
// ============================================
function showDataEkskulKelas() {
  if (!currentGuru) return;
  guruDashboard.style.display = "none";
  document.getElementById("guruDataEkskulScreen").style.display = "flex";
  document.getElementById("guruDataClassTag").textContent = "Wali Kelas " + currentGuru.kelas;

  if (guruClassData.length > 0) {
    renderDataEkskulList(guruClassData);
  } else {
    loadTeacherDashboard().then(() => renderDataEkskulList(guruClassData));
  }
}

function backToGuruDashboard() {
  document.getElementById("guruDataEkskulScreen").style.display = "none";
  document.getElementById("guruRekapDendaScreen").style.display = "none";
  const redScreen = document.getElementById("guruRedemptionScreen");
  if (redScreen) redScreen.style.display = "none";
  guruDashboard.style.display = "flex";
}

function renderDataEkskulList(students) {
  const container = document.getElementById("guruDataStudentList");
  container.innerHTML = "";

  if (students.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:32px;">Tidak ada data siswa</div>`;
    return;
  }

  const BATCH = 6;
  let idx = 0;

  function drawBatch() {
    const frag = document.createDocumentFragment();
    const end = Math.min(idx + BATCH, students.length);
    for (; idx < end; idx++) {
      frag.appendChild(createStudentCard(students[idx]));
    }
    container.appendChild(frag);
    if (idx < students.length) requestAnimationFrame(drawBatch);
  }
  drawBatch();
}

function createStudentCard(s) {
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

  const photoHtml = s.photo_url
    ? `<img class="guru-student-photo" src="${s.photo_url}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="guru-student-photo-placeholder" style="display:none;">👤</div>`
    : `<div class="guru-student-photo-placeholder">👤</div>`;

  const ekstraHtml = hasEkskul
    ? `<div class="guru-student-ekstra">${s.ekstra}</div>`
    : `<div class="guru-student-ekstra no-ekstra-text">${s.regMessage || 'belum terdaftar di Ekskul'}</div>`;

  // Badges
  const badges = [];
    if (s.hasAlpha) badges.push(`<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;background:rgba(239,68,68,0.12);color:var(--red);white-space:nowrap;">ALPHA (${s.alphaCount})</span>`);
  badges.push(`<span class="badge-point ${s.netPoint < 0 ? 'negative' : ''}">${s.netPoint} poin</span>`);
    if (s.sisa > 0) badges.push(`<span class="badge-denda unpaid">Sisa Rp ${s.sisa.toLocaleString('id-ID')}</span>`);
  else if (s.totalDebt > 0) badges.push(`<span class="badge-denda paid">Lunas</span>`);
  else badges.push(`<span class="badge-denda paid">-</span>`);
  badges.push(`<span class="badge-syarat ${s.syarat_khusus === 'SUDAH' ? 'done' : 'pending'}">${s.syarat_khusus || 'BELUM'}</span>`);

  const badgesHtml = `<div class="guru-student-badges">${badges.join('')}</div>`;

  let attendanceHtml = "";
  if (s.attendanceDays && s.attendanceDays.length > 0) {
    attendanceHtml = s.attendanceDays.map(day => {
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
        ${badgesHtml}
      </div>
      ${photoHtml}
    </div>
    <div class="guru-student-expand">
      <div class="attendance-grid">${attendanceHtml}</div>
    </div>
  `;

  return card;
}

// ============================================
// TEACHER: REKAP DENDA
// ============================================
function showRekapDenda() {
  if (!currentGuru) return;
  guruDashboard.style.display = "none";
  document.getElementById("guruRekapDendaScreen").style.display = "flex";
  document.getElementById("guruDendaClassTag").textContent = "Wali Kelas " + currentGuru.kelas;

  if (guruClassData.length > 0) {
    renderRekapDendaList(guruClassData);
  } else {
    loadTeacherDashboard().then(() => renderRekapDendaList(guruClassData));
  }
}

function backToGuruDashboardFromDenda() {
  backToGuruDashboard();
}

function fmtRekapDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderRekapDendaList(students) {
  const container = document.getElementById("guruDendaStudentList");
  container.innerHTML = "";

  const withDebt = students.filter(s => s.sisa > 0).sort((a, b) => b.sisa - a.sisa);
  const noDebt   = students.filter(s => s.sisa === 0).sort((a, b) => a.nama.localeCompare(b.nama));
  const sorted   = [...withDebt, ...noDebt];

  if (sorted.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:32px;">Tidak ada data siswa</div>`;
    return;
  }

  sorted.forEach(s => {
    const hasDebt = s.sisa > 0;
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
            <div class="debt-detail-value red">Rp ${s.totalDebt.toLocaleString("id-ID")}</div>
            <div class="debt-detail-label">Total Denda</div>
          </div>
          <div class="debt-detail-item">
            <div class="debt-detail-value green">Rp ${s.paid.toLocaleString("id-ID")}</div>
            <div class="debt-detail-label">Sudah Dibayar</div>
          </div>
          <div class="debt-detail-item">
            <div class="debt-detail-value ${hasDebt ? 'red' : 'green'}">Rp ${s.sisa.toLocaleString("id-ID")}</div>
            <div class="debt-detail-label">Sisa</div>
          </div>
        </div>
        ${(s.payments && s.payments.length > 0) ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Riwayat Pembayaran</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${s.payments.map(p => `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;">
                  <div style="min-width:0;">
                    <div style="font-weight:700;color:var(--green);">Rp ${Number(p.amount).toLocaleString("id-ID")}</div>
                    <div style="color:var(--text-secondary);font-size:11px;margin-top:1px;">${fmtRekapDate(p.created_at)}</div>
                  </div>
                  <div style="text-align:right;font-weight:600;color:var(--text-secondary);white-space:nowrap;">
                    Diterima: ${p.submitter || "-"}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

// ============================================
// TEACHER: POIN PENEBUSAN (NEW)
// ============================================
function showRedemptionClass() {
  if (!currentGuru) return;
  guruDashboard.style.display = "none";
  document.getElementById("guruRedemptionScreen").style.display = "flex";
  document.getElementById("guruRedemptionClassTag").textContent = "Wali Kelas " + currentGuru.kelas;

  if (guruClassData.length > 0) {
    renderRedemptionClassList(guruClassData);
  } else {
    loadTeacherDashboard().then(() => renderRedemptionClassList(guruClassData));
  }
}

function renderRedemptionClassList(students) {
  const container = document.getElementById("guruRedemptionList");
  container.innerHTML = "";

  const withRed = students.filter(s => s.redemptions && s.redemptions.length > 0)
    .sort((a, b) => b.redemptionTotal - a.redemptionTotal);

  if (withRed.length === 0) {
    container.innerHTML = `<div class="admin-empty">Belum ada siswa yang menerima poin penebusan</div>`;
    return;
  }

  withRed.forEach(s => {
    const div = document.createElement("div");
    div.className = "guru-rekap-item accepted";
    div.style.borderLeftColor = "var(--green)";

    const redList = s.redemptions.map(r => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <div>
          <div style="font-weight:700;">+${r.poin} poin</div>
          <div style="color:var(--text-secondary);font-size:11px;">${r.deskripsi || '-'}</div>
        </div>
        <div style="color:var(--text-secondary);font-size:11px;font-weight:600;white-space:nowrap;">${r.guru}</div>
      </div>
    `).join('');

    div.innerHTML = `
      <div class="guru-rekap-info" style="flex:1;min-width:0;">
        <div class="guru-rekap-name">${s.nama}</div>
        <div style="font-size:13px;color:var(--green);font-weight:700;margin-top:2px;">Total: +${s.redemptionTotal} poin</div>
        <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">${redList}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

// ============================================
// TEACHER: WA REPORT (choice modal)
// ============================================
function openWaChoiceModal() {
  if (!currentGuru) return;
  if (guruClassData.length === 0) {
    showStudentToast("Data belum dimuat, mohon tunggu...", "info");
    return;
  }
  document.getElementById("waChoiceModal").classList.add("visible");
}

function closeWaChoiceModal() {
  document.getElementById("waChoiceModal").classList.remove("visible");
}

function openWhatsApp(text) {
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

// Students with a liability: absences, negative net point, unpaid denda, or missing syarat khusus
function buildTanggunganReport() {
  const list = guruClassData
    .filter(s => s.alphaCount > 0 || s.netPoint < 0 || s.sisa > 0 || s.hasSyaratIssue)
    .sort((a, b) => b.alphaCount - a.alphaCount || a.netPoint - b.netPoint || b.sisa - a.sisa);

  let msg = `*${currentGuru.kelas}*\nSiswa dengan tanggungan\n\n`;
  if (list.length === 0) {
    msg += "Tidak ada siswa dengan tanggungan 🎉\n";
    return msg;
  }
  list.forEach(s => {
    const ekstra = (s.ekstra && s.ekstra !== '0' && s.ekstra.trim() !== '') ? s.ekstra : "belum ekskul";
    const parts = [ekstra, `Alpha ${s.alphaCount}x`, `minus ${s.netPoint}`];
    if (s.sisa > 0) parts.push(`denda Rp ${s.sisa.toLocaleString("id-ID")}`);
    if (s.hasSyaratIssue) parts.push("syarat khusus belum");
    msg += `* ${s.nama} - ${parts.join(" - ")}\n`;
  });
  return msg;
}

// Students accepted into an ekskul, with no debt / minus point / syarat issue left
function buildValidasiReport() {
  const list = guruClassData.filter(s =>
    s.regStatus === 'accepted' && !s.hasSyaratIssue && !s.hasDebt && !s.hasMinusPoint
  );

  let msg = `*${currentGuru.kelas}*\nSiswa siap validasi\n\n`;
  if (list.length === 0) {
    msg += "Belum ada siswa yang siap validasi\n";
    return msg;
  }
  list.forEach(s => { msg += `* ${s.nama}\n`; });
  return msg;
}

function sendWaTanggungan() {
  closeWaChoiceModal();
  openWhatsApp(buildTanggunganReport());
}

function sendWaValidasi() {
  closeWaChoiceModal();
  openWhatsApp(buildValidasiReport());
}

function sendWaSemua() {
  closeWaChoiceModal();
  openWhatsApp(buildTanggunganReport() + "\n" + buildValidasiReport());
}

// ============================================
// DEPRECATED — kept so old HTML doesn't crash
// ============================================
function showRekapPendaftaran() {
  showStudentToast("Gunakan menu Kehadiran Ekskul untuk melihat peminatan", "info");
}
function backToGuruDashboardFromRekap() { backToGuruDashboard(); }
function showSyaratKhusus() {
  showStudentToast("Gunakan panel Pemberitahuan untuk melihat syarat khusus", "info");
}
function backToGuruDashboardFromSyarat() { backToGuruDashboard(); }
async function loadSyaratKhusus() {}
function renderSyaratList(students) {}