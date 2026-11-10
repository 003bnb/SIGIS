const TOKEN_KEY = 'sigis_token';
const USER_KEY = 'sigis_user';

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && location.pathname !== '/') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      location.href = '/';
    }
    throw new Error(data.error || `Erreur HTTP ${response.status}`);
  }
  return data;
}

function showFeedback(element, message, type = '') {
  if (!element) return;
  element.textContent = message;
  element.className = `feedback${type ? ` ${type}` : ''}`;
}

function formatNumber(value) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

async function initLogin() {
  const form = document.querySelector('#login-form');
  if (!form) return;
  if (localStorage.getItem(TOKEN_KEY)) {
    location.replace('/dashboard.html');
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = document.querySelector('#login-feedback');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showFeedback(feedback, 'Connexion en cours…');
    try {
      const response = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.elements.email.value,
          password: form.elements.password.value
        })
      });
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      location.href = '/dashboard.html';
    } catch (error) {
      showFeedback(feedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

async function initAdmission() {
  const form = document.querySelector('#admission-form');
  if (!form) return;
  const feedback = document.querySelector('#admission-feedback');
  const programSelect = form.elements.filiere_id;
  try {
    const { programs } = await api('/scolarite/programs');
    programSelect.innerHTML = '<option value="">Choisir une filière</option>' +
      programs.map((program) => `<option value="${program.id}">${escapeHtml(program.nom)}</option>`).join('');
  } catch (error) {
    programSelect.innerHTML = '<option value="">Filières indisponibles</option>';
    showFeedback(feedback, `Impossible de charger les filières : ${error.message}`, 'error');
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const result = await api('/admission', { method: 'POST', body: JSON.stringify(data) });
      form.reset();
      form.elements.annee_academique.value = '2026-2027';
      showFeedback(feedback, `Candidature envoyée (référence ${result.candidate.id}).`, 'success');
    } catch (error) {
      showFeedback(feedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function statusLabel(status) {
  const labels = { EN_ATTENTE: 'En attente', ACCEPTE: 'Acceptée', REFUSE: 'Refusée' };
  return labels[status] || status;
}

async function loadCandidates() {
  const body = document.querySelector('#candidate-rows');
  const { candidates } = await api('/admission');
  body.innerHTML = candidates.length ? candidates.map((candidate) => {
    const className = candidate.statut === 'ACCEPTE' ? 'status-accepted' :
      candidate.statut === 'REFUSE' ? 'status-refused' : '';
    const actions = candidate.statut === 'EN_ATTENTE'
      ? `<div class="action-group">
           <button class="button button-secondary" data-status="ACCEPTE" data-id="${candidate.id}">Accepter</button>
           <button class="button button-quiet" data-status="REFUSE" data-id="${candidate.id}">Refuser</button>
         </div>`
      : candidate.numero_etudiant
        ? `<span class="muted">Dossier ${escapeHtml(candidate.numero_etudiant)}</span>`
        : '—';
    return `<tr>
      <td><strong>${escapeHtml(candidate.prenom)} ${escapeHtml(candidate.nom)}</strong><br><span class="muted">${escapeHtml(candidate.email)}</span></td>
      <td>${escapeHtml(candidate.filiere || '—')}</td><td>${escapeHtml(candidate.niveau_souhaite)}</td>
      <td>${escapeHtml(candidate.annee_academique)}</td>
      <td><span class="status ${className}">${statusLabel(candidate.statut)}</span></td><td>${actions}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="muted">Aucune candidature.</td></tr>';
}

async function loadStudents() {
  const body = document.querySelector('#student-rows');
  const { students } = await api('/scolarite/students');
  body.innerHTML = students.length ? students.map((student) => `<tr>
    <td>${escapeHtml(student.numero_etudiant)}</td><td>${escapeHtml(student.nom_complet || '—')}</td>
    <td>${escapeHtml(student.filiere)}</td><td>${escapeHtml(student.niveau)}</td><td>${escapeHtml(student.statut)}</td>
  </tr>`).join('') : '<tr><td colspan="5" class="muted">Aucun étudiant.</td></tr>';
  const select = document.querySelector('#grade-student');
  select.innerHTML = '<option value="">Choisir un étudiant</option>' +
    students.map((student) => `<option value="${student.id}">${escapeHtml(student.numero_etudiant)} — ${escapeHtml(student.nom_complet || student.filiere)}</option>`).join('');
}

async function loadPrograms() {
  const { programs } = await api('/scolarite/programs');
  const options = '<option value="">Choisir une filière</option>' +
    programs.map((program) => `<option value="${program.id}">${escapeHtml(program.nom)}</option>`).join('');
  document.querySelector('#student-program').innerHTML = options;
}

async function loadStudentCourses(studentId) {
  const select = document.querySelector('#grade-course');
  if (!studentId) {
    select.innerHTML = '<option value="">Choisir un étudiant</option>';
    select.disabled = true;
    return;
  }
  const { courses } = await api(`/notes/student/${encodeURIComponent(studentId)}/transcript`);
  select.innerHTML = '<option value="">Choisir une UE</option>' +
    courses.map((course) => `<option value="${course.inscription_ue_id}">${escapeHtml(course.code)} — ${escapeHtml(course.intitule)}</option>`).join('');
  select.disabled = courses.length === 0;
}

async function loadMyTranscript() {
  const { student } = await api('/scolarite/me/student');
  const { courses, summary } = await api(`/notes/student/${student.id}/transcript`);
  document.querySelector('#my-number').textContent = student.numero_etudiant;
  document.querySelector('#my-program').textContent = `${student.filiere} · ${student.niveau}`;
  document.querySelector('#my-average').textContent = summary.average === null ? '—' : `${formatNumber(summary.average)} / 20`;
  document.querySelector('#my-ects').textContent = formatNumber(summary.ects_validated);
  document.querySelector('#my-ects-total').textContent = `sur ${formatNumber(summary.ects_total)} ECTS`;
  document.querySelector('#transcript-rows').innerHTML = courses.length ? courses.map((course) => `<tr>
    <td><strong>${escapeHtml(course.code)}</strong><br><span class="muted">${escapeHtml(course.intitule)}</span></td>
    <td>${escapeHtml(course.semestre)}</td><td>${formatNumber(course.ects)}</td>
    <td>${formatNumber(course.cc)}</td><td>${formatNumber(course.exam)}</td><td>${formatNumber(course.average)}</td>
  </tr>`).join('') : '<tr><td colspan="6" class="muted">Aucune inscription pédagogique pour le moment.</td></tr>';
}

async function initDashboard() {
  const staffSection = document.querySelector('#staff-dashboard');
  if (!staffSection) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    location.replace('/');
    return;
  }
  const user = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
  document.querySelector('#user-name').textContent = user.nom_complet || user.email || '';
  document.querySelector('#user-role').textContent = ({ ADMIN: 'Administration', SCOLARITE: 'Scolarité', ETUDIANT: 'Étudiant' })[user.role] || user.role || '';
  document.querySelector('#logout-button').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.href = '/';
  });
  const feedback = document.querySelector('#page-feedback');
  try {
    if (user.role === 'ETUDIANT') {
      document.querySelector('#student-dashboard').classList.remove('hidden');
      document.querySelector('.page-heading .muted').textContent = 'Consultez votre dossier et vos résultats académiques.';
      document.querySelector('.page-heading .button').classList.add('hidden');
      await loadMyTranscript();
      return;
    }

    staffSection.classList.remove('hidden');
    await Promise.all([
      api('/scolarite/dashboard').then((result) => {
        document.querySelector('#metric-students').textContent = formatNumber(result.indicators.etudiants_actifs);
        document.querySelector('#metric-candidates').textContent = formatNumber(result.indicators.candidatures_en_attente);
        document.querySelector('#metric-ues').textContent = formatNumber(result.indicators.unites_enseignement);
        document.querySelector('#metric-grades').textContent = formatNumber(result.indicators.notes_saisies);
      }),
      loadStudents(),
      loadCandidates(),
      loadPrograms()
    ]);
  } catch (error) {
    showFeedback(feedback, error.message, 'error');
  }

  document.querySelector('#refresh-candidates').addEventListener('click', async () => {
    try { await loadCandidates(); } catch (error) { showFeedback(feedback, error.message, 'error'); }
  });
  document.querySelector('#candidate-rows').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-status]');
    if (!button) return;
    button.disabled = true;
    try {
      const result = await api(`/admission/${button.dataset.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ statut: button.dataset.status })
      });
      await loadCandidates();
      if (result.student) {
        showFeedback(feedback, `Candidature acceptée. Dossier étudiant créé : ${result.student.numero_etudiant}.`, 'success');
      }
      const { indicators } = await api('/scolarite/dashboard');
      document.querySelector('#metric-candidates').textContent = formatNumber(indicators.candidatures_en_attente);
    } catch (error) {
      showFeedback(feedback, error.message, 'error');
      button.disabled = false;
    }
  });
  document.querySelector('#grade-student').addEventListener('change', async (event) => {
    try { await loadStudentCourses(event.target.value); } catch (error) { showFeedback(feedback, error.message, 'error'); }
  });
  document.querySelector('#grade-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const gradeFeedback = document.querySelector('#grade-feedback');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify({
          inscription_ue_id: form.elements['grade-course'].value,
          type_evaluation: form.elements['grade-type'].value,
          note: form.elements['grade-value'].value
        })
      });
      showFeedback(gradeFeedback, 'Note enregistrée avec succès.', 'success');
      form.elements['grade-value'].value = '';
      const { indicators } = await api('/scolarite/dashboard');
      document.querySelector('#metric-grades').textContent = formatNumber(indicators.notes_saisies);
    } catch (error) {
      showFeedback(gradeFeedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('#student-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const studentFeedback = document.querySelector('#student-feedback');
    button.disabled = true;
    try {
      await api('/scolarite/students', {
        method: 'POST',
        body: JSON.stringify({
          numero_etudiant: form.elements['student-number'].value,
          filiere_id: form.elements['student-program'].value,
          niveau: form.elements['student-level'].value,
          annee_academique: form.elements['student-year'].value
        })
      });
      showFeedback(studentFeedback, 'Dossier étudiant créé.', 'success');
      form.reset();
      form.elements['student-year'].value = '2026-2027';
      await loadStudents();
      const { indicators } = await api('/scolarite/dashboard');
      document.querySelector('#metric-students').textContent = formatNumber(indicators.etudiants_actifs);
    } catch (error) {
      showFeedback(studentFeedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initAdmission();
  initDashboard();
});
