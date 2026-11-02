import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
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
const progressPath = path.join(__dirname, ".data", "session-progress.json");

const documents = await loadDocuments();
let sessionProgress = await loadSessionProgress();
const approvalLocks = new Set();
const ollamaUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(
  /\/+$/,
  ""
);
const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:3b";

async function loadSessionProgress() {
  try {
    const savedProgress = await fs.readFile(progressPath, "utf-8");
    const parsedProgress = JSON.parse(savedProgress);

    if (!parsedProgress || typeof parsedProgress !== "object" || Array.isArray(parsedProgress)) {
      throw new Error("Saved session progress must be a JSON object");
    }

    return new Map(Object.entries(parsedProgress));
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }
}

async function saveSessionProgress(progress) {
  const directory = path.dirname(progressPath);
  const temporaryPath = `${progressPath}.${process.pid}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    temporaryPath,
    JSON.stringify(Object.fromEntries(progress), null, 2),
    "utf-8"
  );
  await fs.rename(temporaryPath, progressPath);
}

function getProgressKey(userId, patientId) {
  return JSON.stringify([userId, patientId]);
}

async function changeSessionProgress(userId, patient, expectedSession, nextSession) {
  const progressKey = getProgressKey(userId, patient.id);

  if (approvalLocks.has(progressKey)) {
    return {
      status: 409,
      body: { error: "This session is already being changed" },
    };
  }

  approvalLocks.add(progressKey);

  try {
    const currentSession = getCurrentSession(userId, patient);

    if (expectedSession !== currentSession) {
      return {
        status: 409,
        body: {
          error: "The active session changed. Refresh the session status before continuing.",
          currentSession,
        },
      };
    }

    const nextProgress = new Map(sessionProgress);
    if (nextSession === 1) {
      nextProgress.delete(progressKey);
    } else {
      nextProgress.set(progressKey, nextSession);
    }

    await saveSessionProgress(nextProgress);
    sessionProgress = nextProgress;

    if (conversations[userId]) {
      delete conversations[userId][patient.id];
    }

    return {
      status: 200,
      body: {
        currentSession: nextSession,
        totalSessions: patient.sessions.length,
        title: patient.sessions[nextSession - 1].title,
        isLastSession: nextSession === patient.sessions.length,
      },
    };
  } catch (error) {
    console.error("Error saving session progress:", error);
    return {
      status: 500,
      body: { error: "Could not save session progress" },
    };
  } finally {
    approvalLocks.delete(progressKey);
  }
}

function getCurrentSession(userId, patient) {
  return sessionProgress.get(getProgressKey(userId, patient.id)) || 1;
}

function getPatientSystemPrompt(profile, patient, userId) {
  if (!patient.sessions) {
    const patientContext = buildDocumentContext([patient]);
    return `${profile.systemPrompt}\n\nContexto del paciente seleccionado:\n\n${patientContext}`;
  }

  const currentSession = getCurrentSession(userId, patient);
  const session = patient.sessions.find(({ number }) => number === currentSession);

  if (!session) {
    throw new Error(`No prompt is configured for session ${currentSession}`);
  }

  return `${session.prompt}\n\nResponde únicamente dentro de esta sesión activa. No anticipes ni inventes actividades, hechos, respuestas o conclusiones de otras sesiones.`;
}

function isValidUserId(userId) {
  return typeof userId === "string" && userId.length > 0 && userId.length <= 128;
}

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

app.get("/patients/:patientId/progress", (req, res) => {
  const { patientId } = req.params;
  const userId = req.query.userId;
  const patient = getPatientDocument(documents, patientId);

  if (!patient?.sessions) {
    return res.status(404).json({ error: "Patient sessions not found" });
  }

  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Valid userId is required" });
  }

  const currentSession = getCurrentSession(userId, patient);

  if (currentSession > patient.sessions.length) {
    return res.status(409).json({ error: "Saved session progress is invalid" });
  }

  res.json({
    currentSession,
    totalSessions: patient.sessions.length,
    title: patient.sessions[currentSession - 1].title,
    isLastSession: currentSession === patient.sessions.length,
  });
});

app.post("/patients/:patientId/approve-session", async (req, res) => {
  const { patientId } = req.params;
  const { userId, currentSession: approvedSession } = req.body;
  const patient = getPatientDocument(documents, patientId);

  if (!patient?.sessions) {
    return res.status(404).json({ error: "Patient sessions not found" });
  }

  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Valid userId is required" });
  }

  const currentSession = getCurrentSession(userId, patient);

  if (approvedSession !== currentSession) {
    return res.status(409).json({
      error: "The active session changed. Refresh the session status before approving.",
      currentSession,
    });
  }

  if (currentSession >= patient.sessions.length) {
    return res.status(409).json({ error: "There are no more sessions to approve" });
  }

  const result = await changeSessionProgress(
    userId,
    patient,
    approvedSession,
    currentSession + 1
  );
  res.status(result.status).json(result.body);
});

app.post("/patients/:patientId/rewind-session", async (req, res) => {
  const { patientId } = req.params;
  const { userId, currentSession: expectedSession } = req.body;
  const patient = getPatientDocument(documents, patientId);

  if (!patient?.sessions) {
    return res.status(404).json({ error: "Patient sessions not found" });
  }

  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Valid userId is required" });
  }

  const currentSession = getCurrentSession(userId, patient);
  if (expectedSession !== currentSession) {
    return res.status(409).json({
      error: "The active session changed. Refresh the session status before continuing.",
      currentSession,
    });
  }

  if (currentSession <= 1) {
    return res.status(409).json({ error: "Already at the first session" });
  }

  const result = await changeSessionProgress(
    userId,
    patient,
    expectedSession,
    currentSession - 1
  );
  res.status(result.status).json(result.body);
});

app.post("/patients/:patientId/reset-progress", async (req, res) => {
  const { patientId } = req.params;
  const { userId, currentSession: expectedSession } = req.body;
  const patient = getPatientDocument(documents, patientId);

  if (!patient?.sessions) {
    return res.status(404).json({ error: "Patient sessions not found" });
  }

  if (!isValidUserId(userId)) {
    return res.status(400).json({ error: "Valid userId is required" });
  }

  const result = await changeSessionProgress(
    userId,
    patient,
    expectedSession,
    1
  );
  res.status(result.status).json(result.body);
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

    if (!isValidUserId(userId)) {
      return res.status(400).json({
        error: "Valid userId is required",
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

    const systemPrompt = getPatientSystemPrompt(profile, selectedPatient, userId);

    // Crear historial para este paciente si no existe
    if (!conversations[userId][selectedPatient.id]) {
      conversations[userId][selectedPatient.id] = [
        {
          role: "system",
          content: systemPrompt,
        },
      ];
    }

    const conversation = conversations[userId][selectedPatient.id];
    conversation[0] = { role: "system", content: systemPrompt };

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
        name: selectedPatient.name || selectedPatient.title,
      },
      session: selectedPatient.sessions
        ? getCurrentSession(userId, selectedPatient)
        : undefined,
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

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});