import { setupSpeechToText } from "./speech-to-text.js";

const messagesDiv =
  document.getElementById("messages");

const textarea =
  document.getElementById("message");

const speechButton =
  document.getElementById("speechButton");

const speechStatus =
  document.getElementById("speechStatus");

const sendButton =
  document.getElementById("sendButton");

const profileName =
  document.getElementById("profileName");

const patientSelect =
  document.getElementById("patientSelect");

const sessionControls =
  document.getElementById("sessionControls");

const sessionStatus =
  document.getElementById("sessionStatus");

const approveSessionButton =
  document.getElementById("approveSessionButton");

const rewindSessionButton =
  document.getElementById("rewindSessionButton");

const resetProgressButton =
  document.getElementById("resetProgressButton");

const sessionActionDialog =
  document.getElementById("sessionActionDialog");

const sessionActionTitle =
  document.getElementById("sessionActionTitle");

const sessionActionMessage =
  document.getElementById("sessionActionMessage");

const cancelSessionActionButton =
  document.getElementById("cancelSessionActionButton");

const confirmSessionActionButton =
  document.getElementById("confirmSessionActionButton");

const userIdKey = "psychology-chatbot-user-id";
let userId = localStorage.getItem(userIdKey);
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem(userIdKey, userId);
}

let currentPatientId = "";
let patients = [];
let currentSession = null;
let pendingSessionAction = null;

const stopDictation = setupSpeechToText({
  button: speechButton,
  textarea,
  status: speechStatus,
  onSilence: sendMessage,
});

function updateProfileDisplay() {
  const selectedPatient = patients.find((patient) => patient.id === currentPatientId);
  profileName.textContent = selectedPatient
    ? selectedPatient.name
    : "Paciente virtual";
}

async function loadPatients() {
  try {
    const res = await fetch("http://localhost:3000/patients");
    const data = await res.json();

    patients = data.patients || [];
    patientSelect.innerHTML = "";

    if (patients.length === 0) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "No hay pacientes disponibles";
      patientSelect.appendChild(emptyOption);
      profileName.textContent = "Sin pacientes";
      return;
    }

    patients.forEach((patient) => {
      const option = document.createElement("option");
      option.value = patient.id;
      option.textContent = patient.name;
      if (patient.summary) {
        option.title = patient.summary;
      }
      patientSelect.appendChild(option);
    });

    currentPatientId = patients[0].id;
    patientSelect.value = currentPatientId;
    updateProfileDisplay();
    await loadSessionProgress();
  } catch (error) {
    console.error("Error loading patients:", error);
    patientSelect.innerHTML = '<option value="">Error al cargar pacientes</option>';
  }
}

async function loadSessionProgress() {
  const patientId = currentPatientId;
  const selectedPatient = patients.find((patient) => patient.id === patientId);

  if (!selectedPatient?.sessionCount) {
    sessionControls.hidden = true;
    currentSession = null;
    return;
  }

  sessionControls.hidden = false;
  sessionStatus.textContent = "Cargando sesión...";
  approveSessionButton.disabled = true;
  rewindSessionButton.disabled = true;
  resetProgressButton.disabled = true;

  try {
    const query = new URLSearchParams({ userId });
    const res = await fetch(
      `http://localhost:3000/patients/${encodeURIComponent(patientId)}/progress?${query}`
    );
    const data = await res.json();

    if (currentPatientId !== patientId) return;

    if (!res.ok) {
      throw new Error(data.error || `Error del servidor: ${res.status}`);
    }

    currentSession = data.currentSession;
    updateSessionControls(data);
  } catch (error) {
    if (currentPatientId !== patientId) return;

    currentSession = null;
    sessionStatus.textContent = `No se pudo cargar el progreso: ${error.message}`;
    approveSessionButton.disabled = true;
    rewindSessionButton.disabled = true;
    resetProgressButton.disabled = true;
  }
}

function updateSessionControls(data) {
  sessionStatus.textContent =
    `Sesión ${data.currentSession} de ${data.totalSessions}: ${data.title}`;
  approveSessionButton.disabled = data.isLastSession;
  approveSessionButton.textContent = data.isLastSession
    ? "Última sesión"
    : "Aprobar sesión y avanzar";
  rewindSessionButton.disabled = data.currentSession <= 1;
  resetProgressButton.disabled = false;
}

function openSessionActionDialog(action) {
  if (currentSession === null) return;
  if (action === "approve" && approveSessionButton.disabled) return;
  if (action === "rewind" && rewindSessionButton.disabled) return;
  if (action === "reset" && resetProgressButton.disabled) return;

  const dialogContent = {
    approve: {
      title: "Avanzar a la siguiente sesión",
      message: `¿Confirmas que la sesión ${currentSession} terminó y apruebas avanzar a la siguiente? El historial del chat de Valentina se limpiará.`,
      confirmLabel: "Confirmar aprobación",
    },
    rewind: {
      title: "Volver a la sesión anterior",
      message: `¿Quieres volver de la sesión ${currentSession} a la sesión ${currentSession - 1}? El historial del chat de Valentina se limpiará.`,
      confirmLabel: "Volver una sesión",
    },
    reset: {
      title: "Reiniciar progreso",
      message: "¿Quieres volver a la sesión 1? Se limpiará el historial del chat de Valentina.",
      confirmLabel: "Reiniciar progreso",
    },
  }[action];

  pendingSessionAction = action;
  sessionActionTitle.textContent = dialogContent.title;
  sessionActionMessage.textContent = dialogContent.message;
  confirmSessionActionButton.textContent = dialogContent.confirmLabel;
  confirmSessionActionButton.disabled = false;
  sessionActionDialog.showModal();
  cancelSessionActionButton.focus();
}

async function confirmSessionAction() {
  if (currentSession === null || !pendingSessionAction) return;

  const patientId = currentPatientId;
  const changedFromSession = currentSession;
  const action = pendingSessionAction;
  const routes = {
    approve: "approve-session",
    rewind: "rewind-session",
    reset: "reset-progress",
  };
  pendingSessionAction = null;
  sessionActionDialog.close();

  approveSessionButton.disabled = true;
  rewindSessionButton.disabled = true;
  resetProgressButton.disabled = true;
  sessionStatus.textContent = "Actualizando progreso...";

  try {
    const res = await fetch(
      `http://localhost:3000/patients/${encodeURIComponent(patientId)}/${routes[action]}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, currentSession: changedFromSession }),
      }
    );
    const data = await res.json();

    if (currentPatientId !== patientId) return;

    if (!res.ok) {
      throw new Error(data.error || `Error del servidor: ${res.status}`);
    }

    currentSession = data.currentSession;
    updateSessionControls(data);
    messagesDiv.innerHTML = "";
    textarea.value = "";
    const statusMessages = {
      approve: `Sesión ${changedFromSession} aprobada. Ahora está activa la sesión ${data.currentSession}.`,
      rewind: `Se volvió a la sesión ${data.currentSession}. El historial anterior se limpió.`,
      reset: "El progreso se reinició. La sesión 1 está activa.",
    };
    addMessage(statusMessages[action], "system");
  } catch (error) {
    if (currentPatientId !== patientId) return;

    sessionStatus.textContent = `No se pudo cambiar el progreso: ${error.message}`;
    await loadSessionProgress();
  }
}

function addMessage(text, sender) {

  const div = document.createElement("div");

  div.classList.add("message");
  div.classList.add(sender);

  div.innerText = text;

  messagesDiv.appendChild(div);

  messagesDiv.scrollTop =
    messagesDiv.scrollHeight;

  return div;
}

async function sendMessage() {

  const message = textarea.value.trim();

  if (!message) return;

  stopDictation();

  // Mostrar mensaje usuario
  addMessage(message, "user");

  textarea.value = "";

  // Mensaje temporal
  const typing =
    addMessage("La paciente está escribiendo...", "bot");

  typing.classList.add("typing");

  try {

    const res = await fetch(
      "http://localhost:3000/chat",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          userId,
          patientId: currentPatientId,
          message,
        }),
      }
    );

    const data = await res.json();

    typing.remove();

    if (data.error) {
      addMessage(
        `Error: ${data.error}`,
        "bot"
      );
    } else {
      addMessage(
        data.reply,
        "bot"
      );
    }

  } catch (error) {

    typing.remove();

    addMessage(
      `Error: ${error.message}`,
      "bot"
    );
  }
}

sendButton.addEventListener("click", sendMessage);

// ENTER para enviar
textarea.addEventListener("keydown", (e) => {

  if (e.key === "Enter" && !e.shiftKey) {

    e.preventDefault();

    sendMessage();
  }
});

patientSelect.addEventListener("change", () => {
  const newPatientId = patientSelect.value;

  if (newPatientId && newPatientId !== currentPatientId) {
    currentPatientId = newPatientId;
    messagesDiv.innerHTML = "";
    updateProfileDisplay();
    addMessage(`Has cambiado al paciente: ${profileName.textContent}`, "system");
    loadSessionProgress();
  }
});

approveSessionButton.addEventListener("click", () => openSessionActionDialog("approve"));
rewindSessionButton.addEventListener("click", () => openSessionActionDialog("rewind"));
resetProgressButton.addEventListener("click", () => openSessionActionDialog("reset"));
cancelSessionActionButton.addEventListener("click", () => {
  pendingSessionAction = null;
  sessionActionDialog.close();
});
confirmSessionActionButton.addEventListener("click", confirmSessionAction);

sessionActionDialog.addEventListener("click", (event) => {
  if (event.target === sessionActionDialog) {
    pendingSessionAction = null;
    sessionActionDialog.close();
  }
});

loadPatients();