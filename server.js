import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "No message provided",
      });
    }

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
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

Usuario: ${message}
              `,
            },
          ],
        },
      ],
    }),
  }
);

    const data = await response.json();

    console.log("GEMINI RAW RESPONSE:");
    console.log(JSON.stringify(data, null, 2));

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return res.status(500).json({
        error: "No reply generated",
        raw: data,
      });
    }

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