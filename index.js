import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

/*
  Memoria simple en RAM
  Luego puedes usar MongoDB/PostgreSQL
*/
const conversations = {};

app.post("/chat", async (req, res) => {
  try {
    const { message, userId = "default-user" } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "No message provided",
      });
    }

    // Crear historial si no existe
    if (!conversations[userId]) {
      conversations[userId] = [
        {
          role: "user",
          parts: [
            {
              text: `
Eres un asistente psicológico de apoyo emocional.

Reglas:
- No diagnosticas enfermedades
- No reemplazas psicólogos
- Ayudas a reflexionar
- Usas tono empático y calmado
- Haces preguntas abiertas
- Hablas de manera natural y fluida
- Recuerdas el contexto de la conversación
- Respondes corto y humano
              `,
            },
          ],
        },
      ];
    }

    // Agregar mensaje del usuario
    conversations[userId].push({
      role: "user",
      parts: [{ text: message }],
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: conversations[userId],
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
    conversations[userId].push({
      role: "model",
      parts: [{ text: reply }],
    });

    res.json({ reply });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});