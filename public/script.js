const messagesDiv =
  document.getElementById("messages");

const textarea =
  document.getElementById("message");

const userId =
  crypto.randomUUID();

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
          message,
        }),
      }
    );

    const data = await res.json();

    typing.remove();

    addMessage(
      data.reply || data.error,
      "bot"
    );

  } catch (error) {

    typing.remove();

    addMessage(
      error.message,
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