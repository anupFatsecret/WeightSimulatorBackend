
import express from "express";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Simple test endpoint
app.get("/", (req, res) => {
  res.send("Weight Simulation Backend is running!");
});

// Generate weight-loss simulation
app.post(
  "/simulate-weight",
  upload.single("image"),
  async (req, res) => {
    try {
      const { currentWeight, heightCm, targetWeight } = req.body;

      if (!req.file) {
        return res.status(400).send("Image required");
      }

      const current = Number(currentWeight);
      const height = Number(heightCm);
      const target = Number(targetWeight);

      if (
        !Number.isFinite(current) ||
        !Number.isFinite(height) ||
        !Number.isFinite(target) ||
        current <= 0 ||
        height <= 0 ||
        target <= 0 ||
        target >= current
      ) {
        return res.status(400).send("Invalid weight or height");
      }

      if (!["image/jpeg", "image/png", "image/webp"]
          .includes(req.file.mimetype)) {
        return res.status(400).send("Unsupported image format");
      }

      const prompt = `
        Edit this photograph to show the same adult
        person at a reduced body weight.

        Current weight: ${current} kg
        Height: ${height} cm
        Target weight: ${target} kg

        Create a realistic visual approximation of
        how the person might look at the target weight.

        Preserve facial identity, hairstyle, clothing,
        pose, lighting and background.
        Keep natural body proportions.
      `;

      const form = new FormData();

      form.append("model", "gpt-image-2.5-flare");
      form.append("prompt", prompt);

      form.append(
        "image",
        new Blob(
          [req.file.buffer],
          { type: req.file.mimetype }
        ),
        "person.jpg"
      );

      const response = await fetch(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: form
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error(result);
        return res.status(response.status).json(result);
      }

      const imageBase64 = result.data?.[0]?.b64_json;

      if (!imageBase64) {
        return res.status(500).send("No image returned");
      }

      res.type("png").send(
        Buffer.from(imageBase64, "base64")
      );

    } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});

