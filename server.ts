import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/parse-image", async (req, res) => {
    if (!ai) {
      return res.status(500).json({ error: "A chave da API do Gemini (GEMINI_API_KEY) não está configurada no servidor." });
    }

    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Imagem não fornecida." });
      }

      // Remove data URL prefix if present
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      let retries = 3;
      let response;
      
      while (retries > 0) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-1.5-pro',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: "Extract the data from this image. It contains a list of employees (leituristas) with their 'Leituras' (Readings) and 'Impedimentos' (Impediments). YOU MUST EXTRACT EVERY SINGLE ROW PRESENT IN THE IMAGE, DO NOT TRUNCATE OR SKIP ANY ROWS. Take your time to carefully transcribe all rows. Return the data EXCLUSIVELY as a valid JSON array of objects, with the keys: 'Nome' (string), 'Leituras' (number), and 'Impedimentos' (number). Do not include markdown formatting like ```json, just the raw JSON array."
                  },
                  {
                    inlineData: {
                      data: base64Data,
                      mimeType: "image/jpeg"
                    }
                  }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json",
              temperature: 0.1
            }
          });
          break; // if successful, break the retry loop
        } catch (error: any) {
          if (error.status === 503 || error?.status === "UNAVAILABLE" || error?.message?.includes("503")) {
            retries--;
            if (retries === 0) throw error;
            // wait 2 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw error;
          }
        }
      }

      let jsonText = response?.text || "[]";
      // Ensure it's valid JSON (just in case the model returns formatting)
      jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const data = JSON.parse(jsonText);
      res.json(data);
    } catch (error: any) {
      console.error("Error parsing image:", error);
      if (error.status === 503 || error?.status === "UNAVAILABLE" || error?.message?.includes("503")) {
        return res.status(503).json({ error: "O serviço de inteligência artificial está temporariamente indisponível devido à alta demanda. Por favor, tente novamente em alguns instantes." });
      }
      res.status(500).json({ error: "Erro ao processar a imagem. Tente novamente." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
