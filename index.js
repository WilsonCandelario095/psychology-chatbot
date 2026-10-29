import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getProfile, listProfiles } from "./profiles.js";
import {
  loadDocuments,
  listPatients,
  getPatientDocument,
  buildDocumentContext,
} from "./documents.js";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/*
  Memoria simple en RAM
  Estructura: conversations[userId][profileKey] = [ historial ]
  Luego puedes usar MongoDB/PostgreSQL
*/
const conversations = {};

const documents = await loadDocuments();
const ollamaUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(
  /\/+$/,
  ""
);
const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:3b";

// Endpoint para listar perfiles disponibles
app.get("/profiles", (req, res) => {
  res.json({
    profiles: listProfiles(),
  });
});

// Endpoint para listar pacientes disponibles
app.get(["/patients", "/documents"], (req, res) => {
  res.json({
    patients: listPatients(documents),
  });
});

// Endpoint para obtener detalles de un perfil
app.get("/profiles/:profileKey", (req, res) => {
  const profile = getProfile(req.params.profileKey);
  res.json(profile);
});

// Endpoint para chat con soporte de perfiles
app.post("/chat", async (req, res) => {
  try {
    const { 
      message, 
      userId = "default-user",
      patientId
    } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "No message provided",
      });
    }

    const profile = getProfile("patient");
    const selectedPatient = getPatientDocument(documents, patientId);

    if (!selectedPatient) {
      return res.status(404).json({
        error: "No patient documents available",
      });
    }

    // Crear estructura de usuario si no existe
    if (!conversations[userId]) {
      conversations[userId] = {};
    }

    // Crear historial para este paciente si no existe
    if (!conversations[userId][selectedPatient.id]) {
      const patientContext = buildDocumentContext([selectedPatient]);

      conversations[userId][selectedPatient.id] = [
        {
          role: "system",
          content: `${profile.systemPrompt}\n\nContexto del paciente seleccionado:\n\n${patientContext}`,
        },
      ];
    }

    const conversation = conversations[userId][selectedPatient.id];

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          conversation[0],
          ...conversation.slice(1),
          { role: "user", content: message },
        ],
        stream: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: data?.error || `Ollama respondió con el estado ${response.status}`,
      });
    }

    const reply = data?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "No reply generated",
        raw: data,
      });
    }

    conversation.push(
      { role: "user", content: message },
      { role: "assistant", content: reply }
    );

    res.json({ 
      reply,
      profile: {
        key: selectedPatient.id,
        name: selectedPatient.title,
      },
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

// Endpoint para limpiar el historial de un perfil
app.delete("/chat/:userId/:patientId", (req, res) => {
  const { userId, patientId } = req.params;
  
  if (conversations[userId] && conversations[userId][patientId]) {
    delete conversations[userId][patientId];
    res.json({ message: "Conversation cleared" });
  } else {
    res.status(404).json({ error: "Conversation not found" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});