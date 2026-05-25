async function sendMessage() {

  const message =
    document.getElementById("message").value;

  const responseDiv =
    document.getElementById("response");

  responseDiv.innerHTML = "Pensando...";

  try {

    const res = await fetch(
      "http://localhost:3000/chat",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          message,
        }),
      }
    );

    const data = await res.json();

    responseDiv.innerHTML =
      data.reply || data.error;

  } catch (error) {

    responseDiv.innerHTML =
      error.message;
  }
}