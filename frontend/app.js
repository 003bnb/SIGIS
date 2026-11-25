const TOKEN_KEY = 'sigis_token';
const USER_KEY = 'sigis_user';

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
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
    try {
      const result = await api('/admission', { method: 'POST', body: new FormData(form) });
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
  const user = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
  body.innerHTML = candidates.length ? candidates.map((candidate) => {
    const className = candidate.statut === 'ACCEPTE' ? 'status-accepted' :
      candidate.statut === 'REFUSE' ? 'status-refused' : '';
    const actions = candidate.statut === 'EN_ATTENTE'
      ? `<div class="action-group">
           <button class="button button-secondary" data-status="ACCEPTE" data-id="${candidate.id}">Accepter</button>
           <button class="button button-quiet" data-status="REFUSE" data-id="${candidate.id}">Refuser</button>
         </div>`
      : user.role === 'ADMIN'
        ? `<div class="action-group">
             ${candidate.statut !== 'EN_ATTENTE' ? `<button class="button button-quiet" data-status="EN_ATTENTE" data-id="${candidate.id}">Réouvrir</button>` : ''}
             ${candidate.statut !== 'ACCEPTE' ? `<button class="button button-secondary" data-status="ACCEPTE" data-id="${candidate.id}">Accepter</button>` : ''}
             ${candidate.statut !== 'REFUSE' ? `<button class="button button-quiet" data-status="REFUSE" data-id="${candidate.id}">Refuser</button>` : ''}
           </div>`
        : candidate.numero_etudiant
          ? `<span class="muted">Dossier ${escapeHtml(candidate.numero_etudiant)}</span>`
          : '—';
    const diploma = candidate.diplome_nom
      ? `<button class="button button-quiet" data-download-diploma="${candidate.id}">Télécharger</button>`
      : '—';
    return `<tr>
      <td><strong>${escapeHtml(candidate.prenom)} ${escapeHtml(candidate.nom)}</strong><br><span class="muted">${escapeHtml(candidate.email)}</span></td>
      <td>${escapeHtml(candidate.filiere || '—')}</td><td>${escapeHtml(candidate.niveau_souhaite)}</td>
      <td>${escapeHtml(candidate.annee_academique)}</td>
      <td><span class="status ${className}">${statusLabel(candidate.statut)}</span></td>
      <td>${diploma}<br><span class="muted">${escapeHtml(candidate.diplome_nom || '')}</span></td>
      <td>${escapeHtml(candidate.notes_admin || '—')}</td><td>${actions}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="muted">Aucune candidature.</td></tr>';
}

async function downloadCandidateDiploma(candidateId) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api/admission/${encodeURIComponent(candidateId)}/documents/diplome`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      location.href = '/';
    }
    throw new Error(data.error || `Erreur HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const extension = ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' })[blob.type] || 'bin';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `diplome-${candidateId}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
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
  const decisionLabels = { EN_COURS: 'En cours', ADMIS: 'Année validée', REDOUBLEMENT: 'Redoublement' };
  const decision = decisionLabels[summary.decision] || summary.decision || '—';
  document.querySelector('#my-ects-total').textContent = `sur ${formatNumber(summary.ects_total)} ECTS · ${decision}`;
  document.querySelector('#transcript-rows').innerHTML = courses.length ? courses.map((course) => {
    const status = course.validee ? 'Validée' : (course.average === null ? 'En cours' : 'Non validée');
    return `<tr>
    <td><strong>${escapeHtml(course.code)}</strong><br><span class="muted">${escapeHtml(course.intitule)}</span></td>
    <td>${escapeHtml(course.semestre)}</td><td>${formatNumber(course.ects)}</td>
    <td>${formatNumber(course.cc)}</td><td>${formatNumber(course.exam)}</td><td>${formatNumber(course.rattrapage)}</td>
    <td>${formatNumber(course.average)}</td><td>${escapeHtml(status)}</td>
  </tr>`;
  }).join('') : '<tr><td colspan="8" class="muted">Aucune inscription pédagogique pour le moment.</td></tr>';
}

async function loadMyEnrollments() {
  const body = document.querySelector('#my-enrollment-rows');
  if (!body) return;
  const { enrollments } = await api('/scolarite/me/enrollments');
  body.innerHTML = enrollments.length ? enrollments.map((item) => `<tr>
    <td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.intitule)}</td><td>${escapeHtml(item.semestre)}</td>
    <td>${formatNumber(item.ects)}</td><td>${escapeHtml(item.annee_academique)}</td>
  </tr>`).join('') : '<tr><td colspan="5" class="muted">Aucune inscription aux UE.</td></tr>';
}

async function loadUsers() {
  const body = document.querySelector('#user-rows');
  if (!body) return;
  const { users } = await api('/users');
  body.innerHTML = users.length ? users.map((u) => `<tr>
    <td>${escapeHtml(u.nom_complet || '—')}</td>
    <td>${escapeHtml(u.email)}</td>
    <td>${escapeHtml(u.role)}</td>
    <td>${u.actif ? 'Oui' : 'Non'}</td>
    <td>${escapeHtml(u.etudiant_id || '—')}</td>
    <td><div class="action-group">
      <button class="button button-secondary" data-user-action="toggle" data-user-id="${u.id}" data-user-actif="${u.actif ? '1' : '0'}">${u.actif ? 'Désactiver' : 'Activer'}</button>
      <button class="button button-quiet" data-user-action="password" data-user-id="${u.id}">Mot de passe</button>
      <button class="button button-quiet" data-user-action="link" data-user-id="${u.id}" data-user-etudiant="${escapeHtml(u.etudiant_id || '')}">Lier étudiant</button>
    </div></td>
  </tr>`).join('') : '<tr><td colspan="6" class="muted">Aucun utilisateur.</td></tr>';
}

async function loadCourses() {
  const body = document.querySelector('#course-rows');
  if (!body) return;
  const { courses } = await api('/scolarite/courses');
  body.innerHTML = courses.length ? courses.map((course) => `<tr>
    <td>${escapeHtml(course.code)}</td><td>${escapeHtml(course.intitule)}</td><td>${escapeHtml(course.filiere_nom)}</td>
    <td>${escapeHtml(course.niveau)}</td><td>${escapeHtml(course.semestre)}</td><td>${formatNumber(course.ects)}</td>
  </tr>`).join('') : '<tr><td colspan="6" class="muted">Aucune UE.</td></tr>';
  const select = document.querySelector('#enrollment-course');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">Choisir une UE</option>' +
      courses.map((course) => `<option value="${course.id}">${escapeHtml(course.code)} — ${escapeHtml(course.intitule)}</option>`).join('');
    if (current) select.value = current;
  }
}

async function loadEnrollments() {
  const body = document.querySelector('#enrollment-rows');
  if (!body) return;
  const { enrollments } = await api('/scolarite/enrollments');
  body.innerHTML = enrollments.length ? enrollments.map((item) => `<tr>
    <td>${escapeHtml(item.numero_etudiant)} — ${escapeHtml(item.nom_complet || '')}</td>
    <td>${escapeHtml(item.code)} — ${escapeHtml(item.intitule)}</td>
    <td>${escapeHtml(item.semestre)}</td><td>${formatNumber(item.ects)}</td><td>${escapeHtml(item.annee_academique)}</td>
    <td><button class="button button-quiet" data-enrollment-delete="${item.id}">Supprimer</button></td>
  </tr>`).join('') : '<tr><td colspan="6" class="muted">Aucune inscription.</td></tr>';
}

function populateEnrollmentStudents(students) {
  const select = document.querySelector('#enrollment-student');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Choisir un étudiant</option>' +
    (students || []).map((student) => `<option value="${student.id}">${escapeHtml(student.numero_etudiant)} — ${escapeHtml(student.nom_complet || student.filiere)}</option>`).join('');
  if (current) select.value = current;
}

function initPasswordForm(feedbackSelector = '#password-feedback', formSelector = '#password-form') {
  const form = document.querySelector(formSelector);
  if (!form) return;
  const feedback = document.querySelector(feedbackSelector);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: form.elements['current-password'].value,
          new_password: form.elements['new-password'].value
        })
      });
      form.reset();
      showFeedback(feedback, 'Mot de passe mis à jour.', 'success');
    } catch (error) {
      showFeedback(feedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
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
  const passwordPanel = document.querySelector('#password-panel');
  try {
    if (user.role === 'ETUDIANT') {
      document.querySelector('#student-dashboard').classList.remove('hidden');
      if (passwordPanel) passwordPanel.classList.remove('hidden');
      document.querySelector('.page-heading .muted').textContent = 'Consultez votre dossier et vos résultats académiques.';
      document.querySelector('.page-heading .button').classList.add('hidden');
      initPasswordForm();
      await Promise.all([loadMyTranscript(), loadMyEnrollments()]);
      return;
    }

    staffSection.classList.remove('hidden');
    if (passwordPanel) passwordPanel.classList.remove('hidden');
    initPasswordForm();

    const studentsPromise = api('/scolarite/students').then((result) => {
      populateEnrollmentStudents(result.students);
      const body = document.querySelector('#student-rows');
      body.innerHTML = result.students.length ? result.students.map((student) => `<tr>
        <td>${escapeHtml(student.numero_etudiant)}</td><td>${escapeHtml(student.nom_complet || '—')}</td>
        <td>${escapeHtml(student.filiere)}</td><td>${escapeHtml(student.niveau)}</td><td>${escapeHtml(student.statut)}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="muted">Aucun étudiant.</td></tr>';
      const select = document.querySelector('#grade-student');
      select.innerHTML = '<option value="">Choisir un étudiant</option>' +
        result.students.map((student) => `<option value="${student.id}">${escapeHtml(student.numero_etudiant)} — ${escapeHtml(student.nom_complet || student.filiere)}</option>`).join('');
      return result.students;
    });

    const tasks = [
      api('/scolarite/dashboard').then((result) => {
        document.querySelector('#metric-students').textContent = formatNumber(result.indicators.etudiants_actifs);
        document.querySelector('#metric-candidates').textContent = formatNumber(result.indicators.candidatures_en_attente);
        document.querySelector('#metric-ues').textContent = formatNumber(result.indicators.unites_enseignement);
        document.querySelector('#metric-grades').textContent = formatNumber(result.indicators.notes_saisies);
      }),
      studentsPromise,
      loadCandidates(),
      api('/scolarite/programs').then(({ programs }) => {
        const options = '<option value="">Choisir une filière</option>' +
          programs.map((program) => `<option value="${program.id}">${escapeHtml(program.nom)}</option>`).join('');
        document.querySelector('#student-program').innerHTML = options;
        const courseProgram = document.querySelector('#course-program');
        if (courseProgram) courseProgram.innerHTML = options;
      }),
      loadCourses(),
      loadEnrollments()
    ];

    if (user.role === 'ADMIN') {
      document.querySelector('#account-management-panel')?.classList.remove('hidden');
      tasks.push(loadUsers());
    }
    if (user.role === 'ADMIN' || user.role === 'SCOLARITE') {
      document.querySelector('#courses-panel')?.classList.remove('hidden');
      document.querySelector('#enrollments-panel')?.classList.remove('hidden');
    }
    if (user.role === 'ADMIN') {
      document.querySelector('#grade-unlock-wrap')?.classList.remove('hidden');
    }

    await Promise.all(tasks);
  } catch (error) {
    showFeedback(feedback, error.message, 'error');
  }

  const refreshCandidates = document.querySelector('#refresh-candidates');
  refreshCandidates?.addEventListener('click', async () => {
    try { await loadCandidates(); } catch (error) { showFeedback(feedback, error.message, 'error'); }
  });

  document.querySelector('#candidate-rows')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-status]');
    const downloadButton = event.target.closest('button[data-download-diploma]');
    if (downloadButton) {
      downloadButton.disabled = true;
      try {
        await downloadCandidateDiploma(downloadButton.dataset.downloadDiploma);
      } catch (error) {
        showFeedback(feedback, error.message, 'error');
      } finally {
        downloadButton.disabled = false;
      }
      return;
    }
    if (!button) return;
    button.disabled = true;
    try {
      const payload = { statut: button.dataset.status };
      if (payload.statut === 'REFUSE') {
        const reason = window.prompt('Motif obligatoire du refus :');
        if (reason === null) {
          button.disabled = false;
          return;
        }
        if (!reason.trim()) throw new Error('Un motif est obligatoire pour refuser une candidature.');
        payload.notes_admin = reason.trim();
      }
      const result = await api(`/admission/${button.dataset.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await loadCandidates();
      const message = result.student?.statut === 'RADIE'
        ? `Candidature mise à jour. Le dossier ${result.student.numero_etudiant} reste radié; sa réactivation doit être faite séparément.`
        : result.student && payload.statut === 'ACCEPTE'
          ? `Candidature acceptée. Dossier étudiant : ${result.student.numero_etudiant}.`
          : `Statut de la candidature mis à jour : ${statusLabel(result.candidate.statut)}.`;
      showFeedback(feedback, message, 'success');
      const { indicators } = await api('/scolarite/dashboard');
      document.querySelector('#metric-candidates').textContent = formatNumber(indicators.candidatures_en_attente);
    } catch (error) {
      showFeedback(feedback, error.message, 'error');
      button.disabled = false;
    }
  });

  document.querySelector('#grade-student')?.addEventListener('change', async (event) => {
    try { await loadStudentCourses(event.target.value); } catch (error) { showFeedback(feedback, error.message, 'error'); }
  });

  document.querySelector('#grade-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const gradeFeedback = document.querySelector('#grade-feedback');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const payload = {
        inscription_ue_id: form.elements['grade-course'].value,
        type_evaluation: form.elements['grade-type'].value,
        note: form.elements['grade-value'].value
      };
      const unlock = document.querySelector('#grade-unlock');
      if (unlock?.checked) payload.verrouillee = false;
      await api('/notes', { method: 'POST', body: JSON.stringify(payload) });
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

  document.querySelector('#student-form')?.addEventListener('submit', async (event) => {
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
      await studentsRefresh();
      const { indicators } = await api('/scolarite/dashboard');
      document.querySelector('#metric-students').textContent = formatNumber(indicators.etudiants_actifs);
    } catch (error) {
      showFeedback(studentFeedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#refresh-users')?.addEventListener('click', async () => {
    try { await loadUsers(); showFeedback(document.querySelector('#users-feedback'), 'Liste actualisée.', 'success'); }
    catch (error) { showFeedback(document.querySelector('#users-feedback'), error.message, 'error'); }
  });

  document.querySelector('#create-user-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const createFeedback = document.querySelector('#create-user-feedback');
    button.disabled = true;
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          nom_complet: form.elements['new-user-name'].value,
          email: form.elements['new-user-email'].value,
          role: form.elements['new-user-role'].value,
          password: form.elements['new-user-password'].value
        })
      });
      form.reset();
      showFeedback(createFeedback, 'Compte créé.', 'success');
      await loadUsers();
    } catch (error) {
      showFeedback(createFeedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#user-rows')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-user-action]');
    if (!button) return;
    button.disabled = true;
    const userId = button.dataset.userId;
    try {
      if (button.dataset.userAction === 'toggle') {
        await api(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ actif: button.dataset.userActif !== '1' }) });
      } else if (button.dataset.userAction === 'password') {
        const password = window.prompt('Nouveau mot de passe (8 caractères minimum) :');
        if (password === null) { button.disabled = false; return; }
        await api(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ password }) });
      } else if (button.dataset.userAction === 'link') {
        const current = button.dataset.userEtudiant || '';
        const value = window.prompt('Identifiant UUID de l’étudiant à lier (laisser vide pour dissocier) :', current);
        if (value === null) { button.disabled = false; return; }
        await api(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ etudiant_id: value.trim() || null }) });
      }
      await loadUsers();
      showFeedback(document.querySelector('#users-feedback'), 'Compte mis à jour.', 'success');
    } catch (error) {
      showFeedback(document.querySelector('#users-feedback'), error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#refresh-courses')?.addEventListener('click', async () => {
    try { await loadCourses(); showFeedback(document.querySelector('#course-feedback'), 'Liste actualisée.', 'success'); }
    catch (error) { showFeedback(document.querySelector('#course-feedback'), error.message, 'error'); }
  });

  document.querySelector('#course-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const courseFeedback = document.querySelector('#course-feedback');
    button.disabled = true;
    try {
      await api('/scolarite/courses', {
        method: 'POST',
        body: JSON.stringify({
          code: form.elements['course-code'].value,
          intitule: form.elements['course-title'].value,
          filiere_id: form.elements['course-program'].value,
          niveau: form.elements['course-level'].value,
          semestre: form.elements['course-semester'].value,
          ects: form.elements['course-ects'].value
        })
      });
      form.reset();
      showFeedback(courseFeedback, 'UE créée.', 'success');
      await loadCourses();
      const { indicators } = await api('/scolarite/dashboard');
      document.querySelector('#metric-ues').textContent = formatNumber(indicators.unites_enseignement);
    } catch (error) {
      showFeedback(courseFeedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#refresh-enrollments')?.addEventListener('click', async () => {
    try { await loadEnrollments(); showFeedback(document.querySelector('#enrollment-feedback'), 'Liste actualisée.', 'success'); }
    catch (error) { showFeedback(document.querySelector('#enrollment-feedback'), error.message, 'error'); }
  });

  document.querySelector('#enrollment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const enrollmentFeedback = document.querySelector('#enrollment-feedback');
    button.disabled = true;
    try {
      await api('/scolarite/enrollments', {
        method: 'POST',
        body: JSON.stringify({
          etudiant_id: form.elements['enrollment-student'].value,
          unite_enseignement_id: form.elements['enrollment-course'].value,
          annee_academique: form.elements['enrollment-year'].value
        })
      });
      showFeedback(enrollmentFeedback, 'Inscription créée.', 'success');
      await loadEnrollments();
    } catch (error) {
      showFeedback(enrollmentFeedback, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#enrollment-rows')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-enrollment-delete]');
    if (!button) return;
    if (!window.confirm('Supprimer cette inscription ?')) return;
    button.disabled = true;
    try {
      await api(`/scolarite/enrollments/${button.dataset.enrollmentDelete}`, { method: 'DELETE' });
      await loadEnrollments();
      showFeedback(document.querySelector('#enrollment-feedback'), 'Inscription supprimée.', 'success');
    } catch (error) {
      showFeedback(document.querySelector('#enrollment-feedback'), error.message, 'error');
      button.disabled = false;
    }
  });
}

async function studentsRefresh() {
  const { students } = await api('/scolarite/students');
  populateEnrollmentStudents(students);
  const body = document.querySelector('#student-rows');
  if (body) {
    body.innerHTML = students.length ? students.map((student) => `<tr>
      <td>${escapeHtml(student.numero_etudiant)}</td><td>${escapeHtml(student.nom_complet || '—')}</td>
      <td>${escapeHtml(student.filiere)}</td><td>${escapeHtml(student.niveau)}</td><td>${escapeHtml(student.statut)}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted">Aucun étudiant.</td></tr>';
  }
  const select = document.querySelector('#grade-student');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">Choisir un étudiant</option>' +
      students.map((student) => `<option value="${student.id}">${escapeHtml(student.numero_etudiant)} — ${escapeHtml(student.nom_complet || student.filiere)}</option>`).join('');
    if (current) select.value = current;
  }
  return students;
}

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initAdmission();
  initDashboard();
});
