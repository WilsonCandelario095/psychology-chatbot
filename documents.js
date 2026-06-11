import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const documentsPath = path.join(__dirname, "documents");

export async function loadDocuments() {
  try {
    const files = await fs.readdir(documentsPath);
    const docs = [];

    for (const fileName of files) {
      const ext = path.extname(fileName).toLowerCase();
      if (![".txt", ".md", ".json"].includes(ext)) continue;

      const content = await fs.readFile(
        path.join(documentsPath, fileName),
        "utf-8"
      );

      const id = path.basename(fileName, ext);
      let audience = ["psychologist", "patient"];

      if (id.startsWith("psychologist_")) {
        audience = ["psychologist"];
      } else if (id.startsWith("patient_")) {
        audience = ["patient"];
      } else if (id.startsWith("shared_")) {
        audience = ["psychologist", "patient"];
      }

      docs.push({
        id,
        title: id.replace(/_/g, " "),
        audience,
        content,
      });
    }

    return docs;
  } catch (error) {
    console.error("Error loading documents:", error);
    return [];
  }
}

export function listDocuments(documents, profileKey) {
  return documents
    .filter((doc) => doc.audience.includes(profileKey))
    .map((doc) => ({ id: doc.id, title: doc.title, audience: doc.audience }));
}

export function getRelevantDocuments(documents, profileKey, message) {
  const lowerMessage = (message || "").toLowerCase();
  const docsForProfile = documents.filter((doc) =>
    doc.audience.includes(profileKey)
  );

  if (!lowerMessage) {
    return docsForProfile.slice(0, 3);
  }

  const keywords = lowerMessage
    .replace(/[^a-z0-9áéíóúñ]+/gi, " ")
    .split(" ")
    .filter((token) => token.length > 3);

  const matches = docsForProfile.filter((doc) => {
    const text = `${doc.title} ${doc.content}`.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword));
  });

  if (matches.length > 0) {
    return matches.slice(0, 3);
  }

  return docsForProfile.slice(0, 3);
}

export function buildDocumentContext(documents) {
  if (!documents || documents.length === 0) {
    return "";
  }

  return documents
    .map(
      (doc, index) =>
        `Documento ${index + 1}: ${doc.title}\nContenido relevante:\n${truncate(doc.content, 800)}`
    )
    .join("\n\n");
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
