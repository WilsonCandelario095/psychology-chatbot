# Psychology Chatbot

Chatbot de paciente virtual que usa Ollama para generar respuestas localmente.
Las conversaciones y los documentos de pacientes se procesan desde el servidor
del proyecto; no se necesita una clave de Gemini.

## Requisitos

- [Ollama](https://ollama.com/download) instalado y en ejecución.
- [Bun](https://bun.sh/) instalado.

## Configuración

Descarga el modelo recomendado:

```bash
ollama pull qwen2.5:3b
```

Instala las dependencias e inicia el servidor:

```bash
bun install
bun run dev
```

Abre [http://localhost:3000](http://localhost:3000). Ollama debe estar
disponible en `http://localhost:11434`; en Windows normalmente queda en
ejecución después de iniciar la aplicación de Ollama. Si hace falta, inicia el
servicio manualmente con `ollama serve`.

## Configuración opcional

Puedes definir estas variables de entorno para usar otra instancia o modelo:

- `OLLAMA_URL`: URL base de Ollama. Por defecto, `http://localhost:11434`.
- `OLLAMA_MODEL`: nombre del modelo instalado en Ollama. Por defecto,
  `qwen2.5:3b`.

Por ejemplo, en PowerShell:

```powershell
$env:OLLAMA_MODEL = "llama3.2"
bun run dev
```

## Dictado por voz

En el chat, pulsa el botón del micrófono y habla en español. El mensaje se envía
automáticamente después de tres segundos de silencio; también puedes pulsar el
micrófono para detener el dictado sin enviarlo automáticamente. El dictado usa
la API de reconocimiento de voz del navegador y está disponible en navegadores
compatibles, como Chrome y Edge. Según el navegador, el reconocimiento puede
requerir conexión a Internet y el audio puede ser procesado por un servicio del
navegador; no se garantiza que el dictado sea local.
