const messagesDiv =
  document.getElementById("messages");

const textarea =
  document.getElementById("message");

const profileName =
  document.getElementById("profileName");

const patientSelect =
  document.getElementById("patientSelect");

const userId =
  crypto.randomUUID();

let currentPatientId = "";
let patients = [];

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
  } catch (error) {
    console.error("Error loading patients:", error);
    patientSelect.innerHTML = '<option value="">Error al cargar pacientes</option>';
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
  }
});

loadPatients();