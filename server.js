
import express from "express";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Image models don't turn bare kg numbers into a body change,
// so spell out how big the change is and what it looks like.
function bmiFor(weightKg, heightCm) {
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

function bodyCategory(bmi) {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "a healthy weight";
  if (bmi < 30) return "overweight";
  if (bmi < 35) return "obese, class I";
  if (bmi < 40) return "obese, class II";
  return "obese, class III";
}

// What the body should look like at the target BMI.
function bodyDescription(bmi) {
  if (bmi < 21) {
    return "a slim, lean build: flat stomach, narrow waist, " +
      "clearly defined jawline and cheekbones, slim neck, " +
      "slim arms and legs with little visible fat";
  }
  if (bmi < 25) {
    return "a trim, normal build: flat or nearly flat stomach, " +
      "visible waist, defined jawline, slimmer face and neck, " +
      "toned arms and thighs";
  }
  if (bmi < 30) {
    return "a solid build with some belly fat, a slightly fuller " +
      "face, a softer jawline and slightly soft arms and thighs";
  }
  if (bmi < 35) {
    return "a heavy build that is visibly smaller than in the " +
      "photo: a smaller rounded belly, a less full face, a " +
      "slightly slimmer neck, and lighter arms and thighs";
  }
  return "a large, soft build with a rounded belly, full face " +
    "and cheeks, thick neck, and heavy arms and thighs";
}

// How visible the change should be, from the share of body weight lost.
function changeSize(percentLost) {
  if (percentLost < 8) return "subtle";
  if (percentLost < 20) return "clearly noticeable";
  if (percentLost < 35) return "dramatic";
  return "very dramatic";
}

// A little more muscle tone the more weight is lost; never a bodybuilder look.
function muscleTone(percentLost) {
  if (percentLost < 8) {
    return "slightly firmer shoulders and arms";
  }
  if (percentLost < 20) {
    return "a little more definition in the shoulders, " +
      "arms and chest";
  }
  return "visible but natural muscle tone in the " +
    "shoulders, arms, chest and legs, like someone " +
    "who exercises regularly";
}

function buildPrompt(current, height, target) {
  const currentBmi = bmiFor(current, height);
  const targetBmi = bmiFor(target, height);
  const lost = current - target;
  const percentLost = (lost / current) * 100;

  return `
    Edit this photograph to show the same adult
    at a lower body weight.

    Now: ${current} kg, ${height} cm tall,
    BMI ${currentBmi.toFixed(1)} (${bodyCategory(currentBmi)}).
    Target: ${target} kg, BMI ${targetBmi.toFixed(1)}
    (${bodyCategory(targetBmi)}) — ${lost.toFixed(1)} kg lighter,
    ${percentLost.toFixed(0)}% of their body weight.

    This is a ${changeSize(percentLost)} change.
    The person in the result should have
    ${bodyDescription(targetBmi)}.

    Show the weight loss everywhere fat is carried:
    face and jawline, neck, chest, belly and waist,
    hips, arms and thighs. The same clothes should
    fit looser on the smaller body.

    As they lose weight they should also look slightly
    more muscular: ${muscleTone(percentLost)}.
    Keep it subtle and natural, not a bodybuilder.

    Keep the same facial identity, hairstyle, skin
    tone, clothing items, pose, camera angle,
    lighting and background. Do not change their
    height or apparent age. Keep it photorealistic.
  `;
}

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

      const prompt = buildPrompt(current, height, target);

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

