
/* ==========================================
   NORTEC CA TRACKER
   Supabase-powered application
========================================== */

// 1. SUPABASE CONFIGURATION

const SUPABASE_URL = "https://pwsemidrmqvbjcfjnaam.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_x9RVQGj9ddXPIVYnRgzbsg_PXC59MaX";

if (!window.supabase) {
  alert("Could not load Supabase. Check your internet connection.");
  throw new Error("Supabase library not loaded.");
}

if (SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")) {
  alert("Add your Supabase publishable key inside script.js.");
  throw new Error("Supabase publishable key missing.");
}

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


// 2. CA CALCULATION SETTINGS

const TERM_WEIGHTS = {
  1: { test: 8, assignment: 2, total: 10 },
  2: { test: 10, assignment: 4, total: 14 },
  3: { test: 12, assignment: 4, total: 16 }
};

const CA_PASS_TARGET = 20;


// 3. APPLICATION STATE

let state = {
  courses: [],
  records: []
};

let currentUser = null;
let currentProfile = null;
let authLoading = false;


// 4. GENERAL HELPERS

function roundMark(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validPercent(value) {
  return value !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 100;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function setSaveStatus(message, isError = false) {
  const status = document.getElementById("saveStatus");

  if (!status) return;

  status.textContent = message;
  status.style.color = isError ? "#dc5555" : "";
}

function setButtonLoading(button, loading, loadingText, normalText) {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}


// 5. AUTHENTICATION SCREEN MANAGEMENT

function showAuthScreen(section = "login") {
  document.getElementById("authScreen").hidden = false;
  document.getElementById("appScreen").hidden = true;

  document.getElementById("loginSection").hidden =
    section !== "login";

  document.getElementById("registerSection").hidden =
    section !== "register";
}

function showApplication() {
  document.getElementById("authScreen").hidden = true;
  document.getElementById("appScreen").hidden = false;
}

document.getElementById("showRegister").addEventListener("click", () => {
  showAuthScreen("register");
});

document.getElementById("showLogin").addEventListener("click", () => {
  showAuthScreen("login");
});


// 6. REGISTRATION

document.getElementById("registerForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    if (authLoading) return;

    const fullName =
      document.getElementById("registerFullName").value.trim();

    const studentId =
      document.getElementById("registerStudentId").value.trim();

    const email =
      document.getElementById("registerEmail").value.trim();

    const password =
      document.getElementById("registerPassword").value;

    const confirmPassword =
      document.getElementById("confirmPassword").value;

    const button = document.getElementById("registerBtn");

    // Validate full name
    if (fullName.length < 2) {
      showToast("Please enter your full name.");
      return;
    }

    // Validate Student ID
    if (studentId.length !== 10 || /\s/.test(studentId)) {
      showToast("Student ID must contain exactly 10 characters.");
      return;
    }

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("Please enter a valid email address.");
      return;
    }

    // Validate password
    if (password.length < 7) {
      showToast("Password must contain at least 7 characters.");
      return;
    }

    if (!/[A-Z]/.test(password)) {
      showToast("Password must contain at least one uppercase letter.");
      return;
    }

    if (!/[0-9]/.test(password)) {
      showToast("Password must contain at least one number.");
      return;
    }

    if (password !== confirmPassword) {
      showToast("Your passwords do not match.");
      return;
    }

    authLoading = true;
    setButtonLoading(button, true, "Creating account...", "Create Account");

    try {

      const { data, error } = await db.auth.signUp({
        email: email,
        password: password,

        options: {
          data: {
            full_name: fullName,
            student_id: studentId
          }
        }
      });

      if (error) throw error;

      // Supabase email confirmation is enabled.
      if (!data.session) {

        showToast("Account created! Check your email to confirm it.");

        document.getElementById("registerForm").reset();

        showAuthScreen("login");

      } else {

        await loadStudentApplication(data.user);

        showToast("Welcome to NORTEC CA Tracker!");

      }

    } catch (error) {

      console.error("Registration error:", error);

      showToast(error.message || "Registration failed.");

    } finally {

      authLoading = false;

      setButtonLoading(
        button,
        false,
        "Creating account...",
        "Create Account"
      );

    }

  }
);


// 7. STUDENT ID LOGIN
// Uses the secure Supabase Edge Function.
// Expected response: { session: { access_token, refresh_token } }

document.getElementById("loginForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    if (authLoading) return;

    const studentId =
      document.getElementById("loginStudentId").value.trim();

    const password =
      document.getElementById("loginPassword").value;

    const button = document.getElementById("loginBtn");

    if (studentId.length !== 10 || /\s/.test(studentId)) {
      showToast("Enter a valid 10-character Student ID.");
      return;
    }

    if (!password) {
      showToast("Enter your password.");
      return;
    }

    authLoading = true;

    setButtonLoading(button, true, "Signing in...", "Sign In");

    try {

      const { data, error } = await db.functions.invoke(
        "student-login",
        {
          body: {
            student_id: studentId,
            password: password
          }
        }
      );

      if (error) throw error;

      if (
        !data ||
        !data.session ||
        !data.session.access_token ||
        !data.session.refresh_token
      ) {
        throw new Error("Login failed. Check your details.");
      }

      const { data: sessionData, error: sessionError } =
        await db.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });

      if (sessionError) throw sessionError;

      await loadStudentApplication(sessionData.user);

      document.getElementById("loginForm").reset();

      showToast("Login successful!");

    } catch (error) {

      console.error("Login error:", error);

      showToast(
        "Login failed. Check your Student ID, password and email confirmation."
      );

    } finally {

      authLoading = false;

      setButtonLoading(button, false, "Signing in...", "Sign In");

    }

  }
);


// 8. LOAD STUDENT PROFILE AND DATA

async function loadStudentApplication(user) {

  if (!user) return;

  currentUser = user;

  try {

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("full_name, student_id, email")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    currentProfile = profile;

    const fullName =
      profile.full_name ||
      user.user_metadata?.full_name ||
      "Student";

    document.getElementById("welcomeName").textContent = fullName;
    document.getElementById("sidebarUserName").textContent = fullName;

    const initial = fullName.charAt(0).toUpperCase();

    document.getElementById("sidebarAvatar").textContent = initial;
    document.getElementById("topbarAvatar").textContent = initial;

    await loadStudentData();

    showApplication();

    showPage("dashboard");

  } catch (error) {

    console.error("Could not load student data:", error);

    showToast("Could not load your profile or CA records.");

    await db.auth.signOut();

    currentUser = null;
    currentProfile = null;

    showAuthScreen("login");

  }

}


// 9. LOAD COURSES AND CA RECORDS FROM SUPABASE

async function loadStudentData() {

  if (!currentUser) return;

  setSaveStatus("Loading...");

  const { data: courses, error: coursesError } = await db
    .from("courses")
    .select("id, name")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (coursesError) throw coursesError;

  const { data: records, error: recordsError } = await db
    .from("ca_records")
    .select("id, course_id, term, test_percent, assignment_percent")
    .eq("user_id", currentUser.id);

  if (recordsError) throw recordsError;

  state.courses = (courses || []).map(course => ({
    id: course.id,
    name: course.name
  }));

  state.records = (records || []).map(record => ({
    id: record.id,
    courseId: record.course_id,
    term: Number(record.term),
    testPercent: Number(record.test_percent),
    assignmentPercent: Number(record.assignment_percent)
  }));

  renderCourses();
  renderProgress();
  populateCourseSelect();

  setSaveStatus("Cloud synced");

}


// 10. NAVIGATION

function showPage(page) {

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle(
      "active",
      section.id === `page-${page}`
    );
  });

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  const titles = {
    dashboard: "Dashboard",
    upload: "Upload CA",
    check: "Check CA",
    courses: "My Courses"
  };

  document.getElementById("pageTitle").textContent =
    titles[page] || "Dashboard";

  if (page === "upload") populateCourseSelect();

  if (page === "dashboard" || page === "check") {
    renderProgress();
  }

  if (page === "courses") renderCourses();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", event => {

  const pageButton = event.target.closest("[data-page]");

  if (pageButton) {
    event.preventDefault();
    showPage(pageButton.dataset.page);
  }

});


// 11. CA CALCULATIONS

function calculateTerm(record) {

  const weight = TERM_WEIGHTS[record.term];

  if (!weight) return 0;

  return roundMark(
    Number(record.testPercent) / 100 * weight.test +
    Number(record.assignmentPercent) / 100 * weight.assignment
  );

}


function getCourseSummary(courseId) {

  const records = state.records.filter(
    record => record.courseId === courseId
  );

  let earned = 0;
  let completedWeight = 0;
  let completedTerms = 0;

  const terms = {};

  for (let term = 1; term <= 3; term++) {

    const record = records.find(
      item => Number(item.term) === term
    );

    if (record) {

      terms[term] = record;

      earned += calculateTerm(record);

      completedWeight += TERM_WEIGHTS[term].total;

      completedTerms++;

    }

  }

  earned = roundMark(earned);

  const remaining = roundMark(40 - completedWeight);

  const required = roundMark(
    Math.max(0, CA_PASS_TARGET - earned)
  );

  const isTerm2Complete = Boolean(terms[1] && terms[2]);

  let color = "blue";
  let status = "In progress";

  if (isTerm2Complete) {

    if (earned >= CA_PASS_TARGET) {
      color = "green";
      status = "On target";
    } else {
      color = "red";
      status = "Below target";
    }

  }

  if (completedTerms === 3) {

    if (earned >= CA_PASS_TARGET) {
      color = "green";
      status = "Pass target reached";
    } else {
      color = "red";
      status = "Below pass target";
    }

  }

  return {
    earned,
    completedWeight,
    remaining,
    completedTerms,
    terms,
    required,
    isTerm2Complete,
    color,
    status
  };

}


// 12. COURSE SELECT MENU

function populateCourseSelect(selectedId = "") {

  const select = document.getElementById("courseSelect");

  select.innerHTML =
    '<option value="">Select a course</option>' +
    state.courses.map(course => `
      <option value="${escapeHTML(course.id)}"
        ${course.id === selectedId ? "selected" : ""}>
        ${escapeHTML(course.name)}
      </option>
    `).join("");

}


// 13. CA PREVIEW

function updateWeightInfo() {

  const term = Number(
    document.getElementById("termSelect").value
  );

  const weight = TERM_WEIGHTS[term];

  document.getElementById("weightInfo").textContent =
    `Test: ${weight.test} marks · Assignment: ${weight.assignment} marks · Total: ${weight.total} marks`;

  updatePreview();

}


function updatePreview() {

  const term = Number(
    document.getElementById("termSelect").value
  );

  const test = document.getElementById("testPercent").value;

  const assignment =
    document.getElementById("assignmentPercent").value;

  const preview =
    document.getElementById("calculationPreview");

  if (!validPercent(test) || !validPercent(assignment)) {

    preview.innerHTML = `
      <span>Weighted CA preview</span>
      <strong>Enter both percentages</strong>
      <small>Use values between 0 and 100.</small>
    `;

    return;

  }

  const weight = TERM_WEIGHTS[term];

  const testMark = roundMark(
    Number(test) / 100 * weight.test
  );

  const assignmentMark = roundMark(
    Number(assignment) / 100 * weight.assignment
  );

  const total = roundMark(testMark + assignmentMark);

  preview.innerHTML = `
    <span>Weighted CA preview</span>
    <strong>${total} / ${weight.total} marks</strong>
    <small>Test: ${testMark}/${weight.test} · Assignment: ${assignmentMark}/${weight.assignment}</small>
  `;

}

document.getElementById("termSelect")
  .addEventListener("change", updateWeightInfo);

document.getElementById("testPercent")
  .addEventListener("input", updatePreview);

document.getElementById("assignmentPercent")
  .addEventListener("input", updatePreview);


// 14. ADD COURSE

document.getElementById("courseForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const input = document.getElementById("newCourse");

    const name = input.value.trim();

    if (!name) return;

    if (
      state.courses.some(
        course => course.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      showToast("That course already exists.");
      return;
    }

    try {

      const { data, error } = await db
        .from("courses")
        .insert({
          id: crypto.randomUUID(),
          user_id: currentUser.id,
          name: name
        })
        .select()
        .single();

      if (error) throw error;

      state.courses.push({
        id: data.id,
        name: data.name
      });

      input.value = "";

      renderCourses();
      renderProgress();
      populateCourseSelect();

      setSaveStatus("Cloud synced");

      showToast("Course added successfully.");

    } catch (error) {

      console.error(error);

      showToast(error.message || "Could not add course.");

    }

  }
);


// 15. SAVE OR UPDATE CA MARKS

document.getElementById("caForm").addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const courseId =
      document.getElementById("courseSelect").value;

    const term =
      Number(document.getElementById("termSelect").value);

    const testPercent =
      document.getElementById("testPercent").value;

    const assignmentPercent =
      document.getElementById("assignmentPercent").value;

    const editId =
      document.getElementById("editId").value;

    const button = document.getElementById("saveBtn");

    if (!courseId) {
      showToast("Please select a course.");
      return;
    }

    if (
      !validPercent(testPercent) ||
      !validPercent(assignmentPercent)
    ) {
      showToast("Enter percentages between 0 and 100.");
      return;
    }

    const existing = state.records.find(
      record => record.id === editId
    );

    const duplicate = state.records.find(
      record =>
        record.courseId === courseId &&
        Number(record.term) === term &&
        record.id !== editId
    );

    if (duplicate) {
      showToast("This course already has marks for that term.");
      return;
    }

    const record = {
      id: editId || crypto.randomUUID(),
      user_id: currentUser.id,
      course_id: courseId,
      term: term,
      test_percent: Number(testPercent),
      assignment_percent: Number(assignmentPercent)
    };

    button.disabled = true;
    button.textContent = "Saving...";

    try {

      let result;

      if (existing) {

        result = await db
          .from("ca_records")
          .update({
            term: record.term,
            test_percent: record.test_percent,
            assignment_percent: record.assignment_percent
          })
          .eq("id", editId)
          .eq("user_id", currentUser.id);

      } else {

        result = await db
          .from("ca_records")
          .insert(record);

      }

      if (result.error) throw result.error;

      await loadStudentData();

      resetForm();

      showToast(existing ? "CA entry updated." : "CA marks saved.");

      showPage("check");

    } catch (error) {

      console.error(error);

      showToast(error.message || "Could not save CA marks.");

    } finally {

      button.disabled = false;

      button.textContent = "Save CA Marks";

    }

  }
);


// 16. RESET CA FORM

function resetForm() {

  document.getElementById("caForm").reset();

  document.getElementById("editId").value = "";

  document.getElementById("saveBtn").textContent =
    "Save CA Marks";

  updateWeightInfo();

}

document.getElementById("resetFormBtn")
  .addEventListener("click", resetForm);


// 17. EDIT CA RECORD

function editRecord(id) {

  const record = state.records.find(
    item => item.id === id
  );

  if (!record) return;

  document.getElementById("editId").value = record.id;

  populateCourseSelect(record.courseId);

  document.getElementById("termSelect").value =
    String(record.term);

  document.getElementById("testPercent").value =
    record.testPercent;

  document.getElementById("assignmentPercent").value =
    record.assignmentPercent;

  document.getElementById("saveBtn").textContent =
    "Update CA Marks";

  updateWeightInfo();

  showPage("upload");

}


// 18. DELETE CA RECORD

async function deleteRecord(id) {

  if (!confirm("Delete this CA entry? This cannot be undone.")) {
    return;
  }

  try {

    const { error } = await db
      .from("ca_records")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await loadStudentData();

    showToast("CA entry deleted.");

  } catch (error) {

    console.error(error);

    showToast("Could not delete CA entry.");

  }

}


// 19. DELETE COURSE

async function deleteCourse(id) {

  const course = state.courses.find(
    item => item.id === id
  );

  if (!course) return;

  if (
    !confirm(
      `Delete "${course.name}" and all its CA records?`
    )
  ) return;

  try {

    const { error } = await db
      .from("courses")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await loadStudentData();

    showToast("Course deleted.");

  } catch (error) {

    console.error(error);

    showToast("Could not delete course.");

  }

}


// 20. COURSE CARD

function courseCard(course, detailed = false) {

  const summary = getCourseSummary(course.id);

  const percentage = Math.min(
    100,
    summary.earned / 40 * 100
  );

  const termText = [1, 2, 3].map(term => {

    const record = summary.terms[term];

    return `T${term}: ${
      record
        ? `${calculateTerm(record)}/${TERM_WEIGHTS[term].total}`
        : "—"
    }`;

  }).join(" · ");

  let targetText = "";

  if (!summary.terms[3]) {

    targetText = summary.earned >= 20
      ? "You've reached 20 marks already."
      : `Need ${summary.required} more marks to reach 20/40 · ${summary.remaining} marks still available.`;

  } else {

    targetText = summary.earned >= 20
      ? "You've reached the 20-mark target."
      : `You are ${roundMark(20 - summary.earned)} marks below the target.`;

  }

  const recordButtons = state.records
    .filter(record => record.courseId === course.id)
    .map(record => `
      <button class="small-btn" data-edit="${escapeHTML(record.id)}">
        Edit T${record.term}
      </button>

      <button class="small-btn" data-delete-record="${escapeHTML(record.id)}">
        Delete T${record.term}
      </button>
    `).join("");

  return `
    <article class="course-card">

      <div class="course-card-top">

        <div>
          <h3>${escapeHTML(course.name)}</h3>

          <div class="course-meta">
            ${summary.completedTerms}/3 terms entered ·
            ${summary.completedWeight}/40 assessment marks recorded
          </div>
        </div>

        <div class="score">
          ${summary.earned}
          <small> / 40</small>
        </div>

      </div>

      <div class="progress-track">
        <div
          class="progress-fill ${summary.color}"
          style="width:${percentage}%">
        </div>
      </div>

      <div class="progress-details">
        <span>${termText}</span>
        <span class="status ${summary.color}">
          ${summary.status}
        </span>
      </div>

      ${detailed ? `

        <div class="course-meta" style="margin-top:13px;line-height:1.6">
          ${targetText}
        </div>

        <div class="course-actions">

          ${recordButtons}

          <button
            class="small-btn"
            data-add-course-record="${escapeHTML(course.id)}">
            + Add / Update CA
          </button>

        </div>

      ` : ""}

    </article>
  `;

}


// 21. RENDER PROGRESS

function renderProgress() {

  const dashboard = document.getElementById("dashboardCourses");

  const check = document.getElementById("checkCourses");

  const dashboardEmpty = document.getElementById("dashboardEmpty");

  const checkEmpty = document.getElementById("checkEmpty");

  dashboard.innerHTML = state.courses
    .map(course => courseCard(course, false))
    .join("");

  check.innerHTML = state.courses
    .map(course => courseCard(course, true))
    .join("");

  dashboardEmpty.hidden = state.courses.length > 0;

  checkEmpty.hidden = state.courses.length > 0;

  updateDashboardStats();

}


// 22. DASHBOARD STATISTICS

function updateDashboardStats() {

  const count = state.courses.length;

  const summaries = state.courses.map(
    course => getCourseSummary(course.id)
  );

  const total = summaries.reduce(
    (sum, summary) => sum + summary.earned,
    0
  );

  const targetCount = summaries.filter(
    summary =>
      summary.earned >= 20 &&
      summary.completedTerms >= 2
  ).length;

  document.getElementById("statCourses").textContent = count;

  document.getElementById("statAverage").textContent =
    count ? `${roundMark(total / count).toFixed(1)}/40` : "—";

  document.getElementById("statAverageSub").textContent =
    count ? "Average CA per course" : "Across entered courses";

  document.getElementById("statTarget").textContent =
    targetCount;

}


// 23. RENDER COURSE MANAGEMENT

function renderCourses() {

  const list = document.getElementById("courseManagement");

  list.innerHTML = state.courses.map(course => {

    const count = state.records.filter(
      record => record.courseId === course.id
    ).length;

    return `
      <div class="managed-course">

        <div>
          <strong>${escapeHTML(course.name)}</strong>
          <small>${count} of 3 term entries recorded</small>
        </div>

        <button
          class="small-btn"
          data-delete-course="${escapeHTML(course.id)}">
          Delete Course
        </button>

      </div>
    `;

  }).join("");

  document.getElementById("coursesEmpty").hidden =
    state.courses.length > 0;

}


// 24. COURSE AND RECORD BUTTON ACTIONS

document.addEventListener("click", event => {

  const edit = event.target.closest("[data-edit]");

  const deleteRecordButton =
    event.target.closest("[data-delete-record]");

  const deleteCourseButton =
    event.target.closest("[data-delete-course]");

  const addRecordButton =
    event.target.closest("[data-add-course-record]");

  if (edit) {
    editRecord(edit.dataset.edit);
  }

  if (deleteRecordButton) {
    deleteRecord(deleteRecordButton.dataset.deleteRecord);
  }

  if (deleteCourseButton) {
    deleteCourse(deleteCourseButton.dataset.deleteCourse);
  }

  if (addRecordButton) {

    resetForm();

    populateCourseSelect(addRecordButton.dataset.addCourseRecord);

    showPage("upload");

  }

});


// 25. EXPORT BACKUP

document.getElementById("exportBtn").addEventListener(
  "click",
  () => {

    const backup = {
      courses: state.courses,
      records: state.records
    };

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = "nortec-ca-tracker-backup.json";

    link.click();

    URL.revokeObjectURL(url);

    showToast("Backup exported.");

  }
);


// 26. IMPORT BACKUP

document.getElementById("importBtn").addEventListener(
  "click",
  () => {
    document.getElementById("importFile").click();
  }
);


document.getElementById("importFile").addEventListener(
  "change",
  async event => {

    const file = event.target.files[0];

    if (!file) return;

    try {

      const imported = JSON.parse(await file.text());

      if (
        !Array.isArray(imported.courses) ||
        !Array.isArray(imported.records)
      ) {
        throw new Error("Invalid backup.");
      }

      const validCourseIds = new Set(
        imported.courses.map(course => course.id)
      );

      const validCourses = imported.courses.every(course =>
        typeof course.id === "string" &&
        typeof course.name === "string" &&
        course.name.trim().length > 0
      );

      const validRecords = imported.records.every(record =>
        typeof record.id === "string" &&
        validCourseIds.has(record.courseId) &&
        TERM_WEIGHTS[record.term] &&
        validPercent(String(record.testPercent)) &&
        validPercent(String(record.assignmentPercent))
      );

      if (!validCourses || !validRecords) {
        throw new Error("Invalid backup data.");
      }

      if (
        !confirm(
          "Importing this backup will replace your current CA Tracker data. Continue?"
        )
      ) return;

      // Remove current records first.
      const { error: recordsError } = await db
        .from("ca_records")
        .delete()
        .eq("user_id", currentUser.id);

      if (recordsError) throw recordsError;

      // Remove current courses.
      const { error: coursesError } = await db
        .from("courses")
        .delete()
        .eq("user_id", currentUser.id);

      if (coursesError) throw coursesError;

      // Insert imported courses.
      if (imported.courses.length > 0) {

        const coursesToInsert = imported.courses.map(course => ({
          id: course.id,
          user_id: currentUser.id,
          name: course.name.trim()
        }));

        const { error } = await db
          .from("courses")
          .insert(coursesToInsert);

        if (error) throw error;

      }

      // Insert imported records.
      if (imported.records.length > 0) {

        const recordsToInsert = imported.records.map(record => ({
          id: record.id,
          user_id: currentUser.id,
          course_id: record.courseId,
          term: record.term,
          test_percent: Number(record.testPercent),
          assignment_percent: Number(record.assignmentPercent)
        }));

        const { error } = await db
          .from("ca_records")
          .insert(recordsToInsert);

        if (error) throw error;

      }

      await loadStudentData();

      showToast("Backup imported successfully.");

    } catch (error) {

      console.error("Backup import error:", error);

      showToast(
        "Import failed. Check your backup and database."
      );

      try {
        await loadStudentData();
      } catch (reloadError) {
        console.error(reloadError);
      }

    } finally {

      event.target.value = "";

    }

  }
);


// 27. SIGN OUT

document.getElementById("logoutBtn").addEventListener(
  "click",
  async () => {

    if (!confirm("Are you sure you want to sign out?")) return;

    try {

      const { error } = await db.auth.signOut();

      if (error) throw error;

      currentUser = null;
      currentProfile = null;

      state = {
        courses: [],
        records: []
      };

      showAuthScreen("login");

      showToast("You have signed out.");

    } catch (error) {

      console.error(error);

      showToast("Could not sign out. Please try again.");

    }

  }
);


// 28. AUTHENTICATION SESSION MANAGEMENT

db.auth.onAuthStateChange((event, session) => {

  if (event === "SIGNED_OUT") {

    currentUser = null;
    currentProfile = null;

    state = {
      courses: [],
      records: []
    };

    showAuthScreen("login");

  }

  // Existing sessions are restored during startup below.
  // A new session created by login is loaded by the login handler.

});


// 29. START APPLICATION

async function startApplication() {

  showAuthScreen("login");

  try {

    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session && data.session.user) {

      await loadStudentApplication(data.session.user);

    }

  } catch (error) {

    console.error("Startup error:", error);

    showToast("Could not restore your session. Please sign in.");

    showAuthScreen("login");

  }

}


// Initial setup

updateWeightInfo();

startApplication();
