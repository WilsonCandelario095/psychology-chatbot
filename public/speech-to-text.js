export function setupSpeechToText({ button, textarea, status, onSilence }) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    button.disabled = true;
    button.title = "El navegador no admite dictado por voz";
    status.textContent = "El dictado por voz no está disponible en este navegador.";
    return () => {};
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.continuous = true;
  recognition.interimResults = true;

  let baseText = "";
  let isListening = false;
  let hasError = false;
  let hasRecognizedSpeech = false;
  let speechIsActive = false;
  let shouldSendOnEnd = false;
  let wasManuallyStopped = false;
  let silenceTimer;

  function clearSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = undefined;
  }

  function scheduleSilenceTimer() {
    clearSilenceTimer();
    if (speechIsActive) return;

    silenceTimer = setTimeout(() => {
      silenceTimer = undefined;
      if (!hasRecognizedSpeech || !textarea.value.trim()) {
        status.textContent = "No se detectó voz.";
        if (isListening) recognition.stop();
        return;
      }

      status.textContent = "Silencio detectado. Enviando mensaje...";

      if (isListening) {
        shouldSendOnEnd = true;
        recognition.stop();
      } else {
        onSilence();
      }
    }, 3000);
  }

  function setListening(listening) {
    isListening = listening;
    button.classList.toggle("listening", listening);
    button.setAttribute("aria-pressed", String(listening));
    button.title = listening ? "Detener dictado" : "Iniciar dictado";
    button.setAttribute(
      "aria-label",
      listening ? "Detener dictado" : "Iniciar dictado"
    );
  }

  recognition.addEventListener("speechstart", () => {
    speechIsActive = true;
    clearSilenceTimer();
  });

  recognition.addEventListener("speechend", () => {
    speechIsActive = false;
    scheduleSilenceTimer();
  });

  recognition.addEventListener("result", (event) => {
    let finalText = "";
    let interimText = "";

    for (const result of event.results) {
      const transcript = result[0].transcript;
      if (result.isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    if (finalText.trim() || interimText.trim()) {
      hasRecognizedSpeech = true;
      if (!speechIsActive) scheduleSilenceTimer();
    }

    const separator = baseText && !/\s$/.test(baseText) ? " " : "";
    textarea.value = `${baseText}${separator}${finalText}${interimText}`;
  });

  recognition.addEventListener("error", (event) => {
    const messages = {
      "not-allowed": "Permite el acceso al micrófono para usar el dictado.",
      "service-not-allowed": "El servicio de reconocimiento de voz no está permitido.",
      "audio-capture": "No se encontró un micrófono disponible.",
      "no-speech": "No se detectó voz. Puedes intentarlo de nuevo.",
      network: "No se pudo conectar con el servicio de reconocimiento de voz.",
    };

    hasError = true;
    shouldSendOnEnd = false;
    clearSilenceTimer();
    status.textContent =
      messages[event.error] || `Error de dictado: ${event.error}.`;
  });

  recognition.addEventListener("end", () => {
    setListening(false);
    speechIsActive = false;

    if (
      !hasError &&
      !wasManuallyStopped &&
      hasRecognizedSpeech &&
      !shouldSendOnEnd &&
      !silenceTimer
    ) {
      scheduleSilenceTimer();
    }

    if (shouldSendOnEnd && !hasError && textarea.value.trim()) {
      shouldSendOnEnd = false;
      clearSilenceTimer();
      onSilence();
      return;
    }

    if (hasError) shouldSendOnEnd = false;
    if (!hasError && hasRecognizedSpeech) {
      status.textContent = "Dictado finalizado.";
    }
  });

  button.addEventListener("click", () => {
    if (isListening) {
      wasManuallyStopped = true;
      clearSilenceTimer();
      shouldSendOnEnd = false;
      recognition.stop();
      status.textContent = "Finalizando dictado...";
      return;
    }

    baseText = textarea.value.trimEnd();
    hasError = false;
    hasRecognizedSpeech = false;
    speechIsActive = false;
    shouldSendOnEnd = false;
    wasManuallyStopped = false;
    status.textContent = "Escuchando…";

    try {
      recognition.start();
      setListening(true);
      scheduleSilenceTimer();
    } catch (error) {
      clearSilenceTimer();
      setListening(false);
      status.textContent = `No se pudo iniciar el dictado: ${error.message}`;
    }
  });

  return () => {
    clearSilenceTimer();
    if (isListening) {
      wasManuallyStopped = true;
      shouldSendOnEnd = false;
      recognition.stop();
    }
  };
}
