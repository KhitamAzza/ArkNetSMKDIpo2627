const API_URL = "https://script.google.com/macros/s/AKfycbxyS9_P4Ktcy5LQ27g1sHM_eJNiOdvAJxIosVKY3Rq4bjAwn9HZ9ho_zPN4A5nDZILXpw/exec";

const ADMIN_PASSWORD = "azkiahasna"; // Change this

const TEACHERS = [
  { nama: "Nizaul Bariroh", kelas: "X TKJ 1", password: "wakeniza" },
  { nama: "Hurin vita", kelas: "X TKJ 2", password: "wakehurin" },
  { nama: "Chusnul khitam azza", kelas: "X DKV 1", password: "azkiahasna" },
  { nama: "Reni rohmawati", kelas: "X DKV 2", password: "wakereni" },
  { nama: "Atika Qorina", kelas: "X TSM 1", password: "wakeatika" },
  { nama: "Deni Affandi", kelas: "X TSM 2", password: "wakedeni" },
  { nama: "Fadhilatul Hidayah", kelas: "X TSM 3", password: "wakedhila" },
  { nama: "Alvia", kelas: "X LPKC", password: "wakealvia" },
  { nama: "Visabella valentine", kelas: "X PH 1", password: "wakevisabel" },
  { nama: "Farhani", kelas: "X PH 2", password: "wakehani" },
  { nama: "Nila", kelas: "X LPK3 1", password: "wakenila" },
  { nama: "Retma fahriza", kelas: "X LPK3 2", password: "wakeretma" },
  { nama: "Syarul Romadhoni, S.Pd", kelas: "XI TKJ 1", password: "wakedoni" },
  { nama: "Hernanda Ade A, S.Pd", kelas: "XI TKJ 2", password: "wakenanda" },
  { nama: "Rizky Andriansyah, S.Kom", kelas: "XI TKJ 3", password: "wakerizky" },
  { nama: "Hafidloh Dawud Lailatul H., M. Pd", kelas: "XI DKV 1", password: "wakehafid" },
  { nama: "Yudi Setiono, S.Pd", kelas: "XI DKV 2", password: "wakeyudi" },
  { nama: "Agung Heri Cahyono, S. Pd", kelas: "XI TSM 1", password: "wakeagung" },
  { nama: "Prilda Bagus Pramono, ST", kelas: "XI TSM 2", password: "wakeprilda" },
  { nama: "Moch. Syamsul Arif, S.Pd", kelas: "XI TSM 3", password: "wakearif" },
  { nama: "Shevi Rima Azari, S.Pd", kelas: "XI LPKC 1", password: "wakeshevi" },
  { nama: "Ezza Joevita Mahardhita Purnomo Putri, S. Pd", kelas: "XI LPKC 2", password: "wakeezza" },
  { nama: "Afrina Rizqi C, S.Tr.Par", kelas: "XI PH", password: "wakeafrina" },
  { nama: "Lailatul Isnaini, S.Farm", kelas: "XI LPK3 1", password: "wakeisna" },
  { nama: "Reni Triwulan Sari, S.Pd", kelas: "XI LPK3 2", password: "wakewulan" },
  { nama: "Enggarsari", kelas: "XII TSM 2", password: "wakeenggar" }
];
const STAFF = [
  // Extra staff who can give redemption points but aren't homeroom teachers
  { nama: "Pak Teguh", password: "staffteguh" },
  { nama: "Bu Rina", password: "staffrina" },
  // Add more as needed
];

function findStaffByPassword(password) {
  const teacher = TEACHERS.find(t => t.password === password);
  if (teacher) return { nama: teacher.nama.split(",")[0], type: "teacher" };
  const staff = STAFF.find(s => s.password === password);
  if (staff) return { nama: staff.nama, type: "staff" };
  return null;
}

// ===== SHARED STATE =====
let currentStudent = null;
let allStudents = [];
let ekstraOptions = [];
let selectedEkstra = null;
let studentStatusData = null;

let currentSyaratStatus = null;
let currentDebtSisa = null;

let currentGuru = null;
let guruClassData = [];

let currentMinusPoint = null;
let currentRedemptionGuru = null;
let redemptionAllStudents = [];   // ← cache for local filtering

// ===== DOM REFS =====
const landingScreen     = document.getElementById("landingScreen");
const studentLoginScreen= document.getElementById("studentLoginScreen");
const dashboardScreen   = document.getElementById("studentDashboard");
const pilihEkskulScreen = document.getElementById("pilihEkskulScreen");
const peminatanScreen   = document.getElementById("peminatanScreen");
const guruLoginScreen   = document.getElementById("guruLoginScreen");
const guruDashboard     = document.getElementById("guruDashboard");

const studentSearch      = document.getElementById("studentSearch");
const searchSuggestions  = document.getElementById("searchSuggestions");
const studentCardPreview = document.getElementById("studentCardPreview");
const previewName        = document.getElementById("previewName");
const previewClass       = document.getElementById("previewClass");

const headerGreeting = document.getElementById("headerGreeting");
const statusBox      = document.getElementById("statusBox");
const statusIcon     = document.getElementById("statusIcon");
const statusText     = document.getElementById("statusText");

const ekstraList     = document.getElementById("ekstraList");
const ekstraDetailBar= document.getElementById("ekstraDetailBar");
const detailName     = document.getElementById("detailName");
const btnDaftar      = document.getElementById("btnDaftar");

const peminatanList = document.getElementById("peminatanList");
const studentToast  = document.getElementById("studentToast");
const studentLoading= document.getElementById("studentLoading");

const alasanModal        = document.getElementById("alasanModal");
const alasanInput        = document.getElementById("alasanInput");
const charCount          = document.getElementById("charCount");
const modalSelectedEkstra= document.getElementById("modalSelectedEkstra");
const btnConfirmDaftar   = document.getElementById("btnConfirmDaftar");

const guruPassword   = document.getElementById("guruPassword");
const guruHeaderName = document.getElementById("guruHeaderName");
const guruClassTag   = document.getElementById("guruClassTag");
const guruStats      = document.getElementById("guruStats");
const guruStudentList= document.getElementById("guruStudentList");

const fabAdmin        = document.getElementById("fabAdmin");
const adminLoginModal = document.getElementById("adminLoginModal");
const adminPassword   = document.getElementById("adminPassword");
const adminDashboard  = document.getElementById("adminDashboard");
const adminStats      = document.getElementById("adminStats");
const adminAlertList  = document.getElementById("adminAlertList");
const adminClassList  = document.getElementById("adminClassList");
const adminEkstraList = document.getElementById("adminEkstraList");

const adminBerisikoScreen    = document.getElementById("adminBerisikoScreen");
const adminPerKelasScreen    = document.getElementById("adminPerKelasScreen");
const adminKelasDetailScreen = document.getElementById("adminKelasDetailScreen");
const adminPerEkskulScreen   = document.getElementById("adminPerEkskulScreen");
const adminEkstraDetailScreen= document.getElementById("adminEkstraDetailScreen");

const berisikoBadge = document.getElementById("berisikoBadge");
const kelasBadge    = document.getElementById("kelasBadge");
const ekstraBadge   = document.getElementById("ekstraBadge");

const adminBerisikoList    = document.getElementById("adminBerisikoList");
const adminKelasList       = document.getElementById("adminKelasList");
const adminKelasDetailList = document.getElementById("adminKelasDetailList");
const adminKelasDetailTitle= document.getElementById("adminKelasDetailTitle");
const adminKelasDetailTag  = document.getElementById("adminKelasDetailTag");
const adminEkstraDetailList= document.getElementById("adminEkstraDetailList");
const adminEkstraDetailTitle= document.getElementById("adminEkstraDetailTitle");
const adminEkstraDetailTag = document.getElementById("adminEkstraDetailTag");

const btnChangeEkstra = document.getElementById("btnChangeEkstra");

const pilihEkskulListScreen = document.getElementById("pilihEkskulListScreen");
const ekstraListView = document.getElementById("ekstraListView");

const kehadiranScreen = document.getElementById("kehadiranScreen");
const kehadiranEmpty = document.getElementById("kehadiranEmpty");
const kehadiranContent = document.getElementById("kehadiranContent");
const donutChartContainer = document.getElementById("donutChartContainer");
const kehadiranSummary = document.getElementById("kehadiranSummary");
const kehadiranDates = document.getElementById("kehadiranDates");

const statusDetail = document.getElementById("statusDetail");

const redemptionLoginScreen = document.getElementById("redemptionLoginScreen");
const redemptionScreen       = document.getElementById("redemptionScreen");
const redemptionPassword     = document.getElementById("redemptionPassword");
const redemptionHeaderName   = document.getElementById("redemptionHeaderName");
const redemptionStudentList  = document.getElementById("redemptionStudentList");
const redemptionBanner       = document.getElementById("redemptionBanner");
const redemptionModal        = document.getElementById("redemptionModal");
const redemptionModalName    = document.getElementById("redemptionModalName");
const redemptionModalClass   = document.getElementById("redemptionModalClass");
const redemptionSlider       = document.getElementById("redemptionSlider");
const redemptionSliderLabel  = document.getElementById("redemptionSliderLabel");
const redemptionDesc         = document.getElementById("redemptionDesc");
const redemptionSubmitBtn    = document.getElementById("redemptionSubmitBtn");

const pointDetailScreen      = document.getElementById("pointDetailScreen");
const pointDetailBig         = document.getElementById("pointDetailBig");
const pointDetailAlpha       = document.getElementById("pointDetailAlpha");
const pointDetailRedemption  = document.getElementById("pointDetailRedemption");
const pointDetailHistory     = document.getElementById("pointDetailHistory");

let selectedRedemptionStudent = null;
let appConfig = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadAppConfig();
});

async function loadAppConfig() {
  const splash = document.getElementById("appSplash");
  try {
    const res = await fetch(API_URL + "?action=getConfig");
    const data = await res.json();
    if (data.status === "ok") {
      appConfig = data;
    } else {
      appConfig = { redemptionEnable: true }; // permissive fallback
    }
  } catch (err) {
    console.error("Splash config error:", err);
    appConfig = { redemptionEnable: true };
  }

  // Fade out and remove splash
  if (splash) {
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 600);
  }
}

// ===== LANDING NAVIGATION =====
function goToStudentLogin() {
  landingScreen.style.display = "none";
  studentLoginScreen.style.display = "flex";
  loadDatabase();
  studentSearch.focus();
}

function goToGuruLogin() {
  landingScreen.style.display = "none";
  guruLoginScreen.style.display = "flex";
  setTimeout(() => guruPassword.focus(), 100);
}

function backToLanding() {
  studentLoginScreen.style.display = "none";
  guruLoginScreen.style.display = "none";
  guruDashboard.style.display = "none";
  landingScreen.style.display = "flex";

  currentGuru = null;
  guruClassData = [];
  if (guruPassword) guruPassword.value = "";

  if (studentSearch) studentSearch.value = "";
  if (searchSuggestions) searchSuggestions.style.display = "none";
  if (studentCardPreview) studentCardPreview.style.display = "none";
  currentStudent = null;
}
function goToRedemptionLogin() {
  // GUARD: block entry if redemption is disabled
  if (!appConfig) {
    showStudentToast("Aplikasi masih memuat, mohon tunggu...", "info");
    return;
  }
  if (appConfig.redemptionEnable === false) {
    showStudentToast("Fitur poin penebusan sedang dinonaktifkan", "error");
    return;
  }

  landingScreen.style.display = "none";
  redemptionLoginScreen.style.display = "flex";
  setTimeout(() => redemptionPassword.focus(), 100);
}

function backToLandingFromRedemption() {
  redemptionLoginScreen.style.display = "none";
  redemptionScreen.style.display = "none";
  landingScreen.style.display = "flex";
  redemptionPassword.value = "";
  currentRedemptionGuru = null;
}

function backToLandingFromPointDetail() {
  pointDetailScreen.style.display = "none";
  dashboardScreen.style.display = "flex";
}

