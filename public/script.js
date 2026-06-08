const messagesDiv =
  document.getElementById("messages");

const textarea =
  document.getElementById("message");

const profileSelect =
  document.getElementById("profileSelect");

const profileName =
  document.getElementById("profileName");

const userId =
  crypto.randomUUID();

let currentProfile = "psychologist"; // Perfil por defecto

// Cargar perfiles al iniciar
async function loadProfiles() {
  try {
    const res = await fetch("http://localhost:3000/profiles");
    const data = await res.json();
    
    // Llenar el select con los perfiles
    profileSelect.innerHTML = "";
    data.profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.key;
      option.textContent = profile.name;
      profileSelect.appendChild(option);
    });
    
    profileSelect.value = currentProfile;
    updateProfileDisplay();
    
  } catch (error) {
    console.error("Error loading profiles:", error);
    profileSelect.innerHTML = '<option>Error al cargar perfiles</option>';
  }
}

// Cambiar de perfil
function changeProfile() {
  const newProfile = profileSelect.value;
  
  if (newProfile !== currentProfile) {
    currentProfile = newProfile;
    
    // Limpiar mensajes anteriores
    messagesDiv.innerHTML = "";
    
    addMessage(`Has cambiado al perfil: ${profileSelect.options[profileSelect.selectedIndex].text}`, "system");
    
    updateProfileDisplay();
  }
}

// Actualizar el nombre del perfil en el header
function updateProfileDisplay() {
  const selectedOption = profileSelect.options[profileSelect.selectedIndex];
  profileName.textContent = selectedOption.textContent;
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
    addMessage("Victor está escribiendo...", "bot");

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
          profileKey: currentProfile,
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

// Cargar perfiles al iniciar la página
loadProfiles();