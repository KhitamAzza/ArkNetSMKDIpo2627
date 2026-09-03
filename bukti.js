// ===== BUKTI KEHADIRAN (Public Viewer) =====

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

let buktiDates = [];
let buktiCurrentDate = null;
let buktiCurrentEkstra = null;
let buktiEkstraList = [];
let buktiProofMap = {};

function showBuktiKehadiran() {
  landingScreen.style.display = "none";
  const el = document.getElementById("buktiScreen");
  if (el) {
    el.style.display = "flex";
    resetBukti();
    loadBuktiDates();
  }
}

function backToLandingFromBukti() {
  const el = document.getElementById("buktiScreen");
  if (el) el.style.display = "none";
  landingScreen.style.display = "flex";
}

function resetBukti() {
  buktiCurrentDate = null;
  buktiCurrentEkstra = null;
  buktiProofMap = {};
  const dateView = document.getElementById('buktiDateListView');
  const ekstraView = document.getElementById('buktiEkstraListView');
  const photoView = document.getElementById('buktiPhotoView');
  const subtitle = document.getElementById('buktiSubtitle');

  if (dateView) dateView.style.display = 'block';
  if (ekstraView) ekstraView.style.display = 'none';
  if (photoView) photoView.style.display = 'none';
  if (subtitle) subtitle.textContent = 'Pilih tanggal';
}

function backBukti() {
  const photoView = document.getElementById('buktiPhotoView');
  const ekstraView = document.getElementById('buktiEkstraListView');

  if (photoView && photoView.style.display !== 'none') {
    showBuktiEkstraList();
  } else if (ekstraView && ekstraView.style.display !== 'none') {
    resetBukti();
    loadBuktiDates();
  } else {
    backToLandingFromBukti();
  }
}

async function loadBuktiDates() {
  const container = document.getElementById('buktiDateList');
  if (container) container.innerHTML = '<div class="bukti-empty" style="padding-top:40px;"><div class="empty-state-icon">⏳</div><div class="empty-state-text">Memuat...</div></div>';
  
  try {
    const { data, error } = await sb
      .from('AttendanceProof')
      .select('date')
      .eq('semester', currentSemester)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    const seen = new Set();
    buktiDates = (data || []).filter(d => {
      if (seen.has(d.date)) return false;
      seen.add(d.date);
      return true;
    });
    
    renderBuktiDateList();
  } catch (err) {
    showStudentToast('Error: ' + err.message, 'error');
    if (container) {
      container.innerHTML = '<div class="bukti-empty" style="padding-top:40px;"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal memuat</div></div>';
    }
  }
}

function renderBuktiDateList() {
  const container = document.getElementById('buktiDateList');
  if (!container) return;
  
  if (!buktiDates.length) {
    container.innerHTML = `
      <div class="bukti-empty">
        <div class="bukti-empty-icon">📭</div>
        <div class="bukti-empty-title">Belum ada bukti upload</div>
        <div class="bukti-empty-sub">Foto absensi akan muncul di sini setelah pembina menguploadnya</div>
      </div>`;
    return;
  }
  
  container.innerHTML = buktiDates.map(d => `
    <div class="bukti-date-btn" onclick="selectBuktiDate('${escapeHtml(d.date)}')">
      <div class="bukti-date-icon">📅</div>
      <div class="bukti-date-text">${escapeHtml(d.date)}</div>
      <div class="bukti-date-arrow">▶</div>
    </div>
  `).join('');
}

async function selectBuktiDate(date) {
  buktiCurrentDate = date;
  const subtitle = document.getElementById('buktiSubtitle');
  const ekstraDateLabel = document.getElementById('buktiEkstraDateLabel');
  if (subtitle) subtitle.textContent = date;
  if (ekstraDateLabel) ekstraDateLabel.textContent = date;
  
  const container = document.getElementById('buktiEkstraList');
  if (container) container.innerHTML = '<div class="bukti-empty" style="padding-top:40px;"><div class="empty-state-icon">⏳</div><div class="empty-state-text">Memuat...</div></div>';
  
  const dateView = document.getElementById('buktiDateListView');
  const ekstraView = document.getElementById('buktiEkstraListView');
  const photoView = document.getElementById('buktiPhotoView');
  if (dateView) dateView.style.display = 'none';
  if (ekstraView) ekstraView.style.display = 'block';
  if (photoView) photoView.style.display = 'none';
  
  try {
    const { data: students, error: sErr } = await sb
      .from('Database')
      .select('ekstra');
    if (sErr) throw sErr;
    
    const ekstraSet = new Set();
    (students || []).forEach(s => {
      const e = (s.ekstra || '').trim();
      if (e && e !== '0') ekstraSet.add(e);
    });
    buktiEkstraList = Array.from(ekstraSet).sort();
    
    const { data: proofs, error: pErr } = await sb
      .from('AttendanceProof')
      .select('ekstra, photo_url, uploaded_by, uploaded_at, page')
      .eq('date', date)
      .eq('semester', currentSemester)
      .order('page', { ascending: true });
    if (pErr) throw pErr;
    
    buktiProofMap = {};
    (proofs || []).forEach(p => {
      if (!buktiProofMap[p.ekstra]) buktiProofMap[p.ekstra] = [];
      buktiProofMap[p.ekstra].push(p);
    });
    
    renderBuktiEkstraList();
  } catch (err) {
    showStudentToast('Error: ' + err.message, 'error');
    if (container) {
      container.innerHTML = '<div class="bukti-empty" style="padding-top:40px;"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Gagal memuat</div></div>';
    }
  }
}

function renderBuktiEkstraList() {
  const container = document.getElementById('buktiEkstraList');
  if (!container) return;
  
  if (!buktiEkstraList.length) {
    container.innerHTML = `
      <div class="bukti-empty">
        <div class="bukti-empty-icon">📭</div>
        <div class="bukti-empty-title">Tidak ada ekskul terdaftar</div>
      </div>`;
    return;
  }
  
  container.innerHTML = buktiEkstraList.map(ekstra => {
    const proofs = buktiProofMap[ekstra];
    const hasPhoto = !!(proofs && proofs.length);
    const metaText = hasPhoto
      ? (proofs.length > 1 ? `${proofs.length} lembar tersedia` : 'Foto tersedia')
      : 'Belum ada foto';
    return `
      <div class="bukti-ekstra-item" onclick="selectBuktiEkstra('${escapeHtml(ekstra)}')">
        <div class="bukti-ekstra-info">
          <div class="bukti-ekstra-name">${escapeHtml(ekstra)}</div>
          <div class="bukti-ekstra-meta">${metaText}</div>
        </div>
        <div class="bukti-ekstra-badge ${hasPhoto ? 'has' : 'missing'}">
          ${hasPhoto ? '✓' : '✗'}
        </div>
      </div>
    `;
  }).join('');
}

function selectBuktiEkstra(ekstra) {
  buktiCurrentEkstra = ekstra;
  const proofs = buktiProofMap[ekstra];
  
  const dateView = document.getElementById('buktiDateListView');
  const ekstraView = document.getElementById('buktiEkstraListView');
  const photoView = document.getElementById('buktiPhotoView');
  const subtitle = document.getElementById('buktiSubtitle');
  
  if (dateView) dateView.style.display = 'none';
  if (ekstraView) ekstraView.style.display = 'none';
  if (photoView) photoView.style.display = 'block';
  if (subtitle) subtitle.textContent = ekstra;
  
  const container = document.getElementById('buktiPhotoContent');
  if (!container) return;
  
  if (!proofs || !proofs.length) {
    container.innerHTML = `
      <div class="bukti-empty">
        <div class="bukti-empty-icon">⚠️</div>
        <div class="bukti-empty-title">Pembina belum upload foto absen</div>
        <div class="bukti-empty-sub">Tanggal: ${escapeHtml(buktiCurrentDate)}</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = proofs.map((proof, i) => {
    const uploadedAt = proof.uploaded_at
      ? new Date(proof.uploaded_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      : '-';
    return `
    <div class="bukti-photo-card" style="${i > 0 ? 'margin-top:16px;' : ''}" onclick="window.open('${escapeHtml(proof.photo_url)}','_blank')">
      <div class="bukti-photo-frame">
        <img src="${escapeHtml(proof.photo_url)}" alt="Bukti absensi lembar ${proof.page || i + 1}" onerror="this.parentElement.innerHTML='<div class=\\'bukti-photo-error\\'>Gagal memuat gambar</div>'">
      </div>
      <div class="bukti-photo-meta">
        <div class="bukti-meta-row">
          <span class="bukti-meta-label">Lembar</span>
          <span class="bukti-meta-value">${proof.page || i + 1} / ${proofs.length}</span>
        </div>
        <div class="bukti-meta-row">
          <span class="bukti-meta-label">Tanggal</span>
          <span class="bukti-meta-value">${escapeHtml(proof.date || buktiCurrentDate)}</span>
        </div>
        <div class="bukti-meta-row">
          <span class="bukti-meta-label">Diupload oleh</span>
          <span class="bukti-meta-value">${escapeHtml(proof.uploaded_by || '-')}</span>
        </div>
        <div class="bukti-meta-row">
          <span class="bukti-meta-label">Waktu upload</span>
          <span class="bukti-meta-value">${uploadedAt}</span>
        </div>
      </div>
    </div>
  `;
  }).join('') + `<div class="bukti-photo-hint">Klik gambar untuk membuka di tab baru</div>`;
}

function showBuktiEkstraList() {
  const photoView = document.getElementById('buktiPhotoView');
  const ekstraView = document.getElementById('buktiEkstraListView');
  const subtitle = document.getElementById('buktiSubtitle');
  
  if (photoView) photoView.style.display = 'none';
  if (ekstraView) ekstraView.style.display = 'block';
  if (subtitle) subtitle.textContent = buktiCurrentDate;
}