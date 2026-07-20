function showStudentToast(message, type) {
  studentToast.textContent = message;
  studentToast.className = "student-toast status-" + type;
  studentToast.style.opacity = "1";
  setTimeout(() => { studentToast.style.opacity = "0"; }, 2500);
}

function showStudentLoading(show) {
  studentLoading.classList.toggle("visible", show);
}