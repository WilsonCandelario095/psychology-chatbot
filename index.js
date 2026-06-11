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
  getRelevantDocuments,
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

    // Crear historial para este perfil si no existe
    if (!conversations[userId][selectedPatient.id]) {
      const patientContext = buildDocumentContext([selectedPatient]);

      conversations[userId][selectedPatient.id] = [
        {
          role: "user",
          parts: [
            {
              text: `${profile.systemPrompt}\n\nContexto del paciente seleccionado:\n\n${patientContext}`,
            },
          ],
        },
      ];
    }

    const relevantDocs = getRelevantDocuments([selectedPatient], "patient", message);
    const docContext = buildDocumentContext(relevantDocs);

    const contents = conversations[userId][selectedPatient.id].map((item) => ({
      ...item,
      role: item.role === "system" ? "user" : item.role,
    }));

    if (docContext) {
      contents.push({
        role: "user",
        parts: [
          {
            text: `Información adicional para esta conversación:\n\n${docContext}`,
          },
        ],
      });
    }

    const userMessage = {
      role: "user",
      parts: [{ text: message }],
    };

    contents.push(userMessage);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
        }),
      }
    );

    const data = await response.json();

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.status(500).json({
        error: "No reply generated",
        raw: data,
      });
    }

    // Guardar respuesta del modelo
    conversations[userId][selectedPatient.id].push({
      role: "model",
      parts: [{ text: reply }],
    });

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