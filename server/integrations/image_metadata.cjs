/**
 * PROJECT NEXUS - Image EXIF & AI Generation Prompt Inspector
 * Extracts AI prompts (Stable Diffusion, ComfyUI, Midjourney, A1111) from PNG chunks
 * and camera EXIF metadata (Make, Model, Lens, ISO, GPS) using ExifReader.
 */
const fs = require('node:fs');
const path = require('node:path');
const ExifReader = require('exifreader');

class ImageMetadataInspector {
  /**
   * Safely inspects an image file to extract AI prompts, models, seeds, and camera parameters.
   */
  static async inspectImage(filePath) {
    try {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) return { success: false, error: 'File does not exist' };

      const ext = path.extname(resolved).toLowerCase().replace('.', '');
      if (!['png', 'jpg', 'jpeg', 'webp', 'tiff', 'heic'].includes(ext)) {
        return { success: false, notImage: true };
      }

      // Read initial 2MB for fast header & metadata extraction without blowing memory
      const stat = fs.statSync(resolved);
      const readSize = Math.min(stat.size, 4 * 1024 * 1024);
      const fd = fs.openSync(resolved, 'r');
      const buffer = Buffer.alloc(readSize);
      try {
        fs.readSync(fd, buffer, 0, readSize, 0);
      } finally {
        fs.closeSync(fd);
      }

      const tags = ExifReader.load(buffer, { expanded: true });

      let aiMetadata = null;
      let cameraMetadata = null;
      let hasGps = false;

      // 1. Detect AI Prompts (PNG tEXt/iTXt, WebP EXIF, or JPEG comments)
      const parametersTag = tags.png?.parameters || tags.pngText?.parameters || tags.exif?.UserComment || tags.xmp?.description;
      const promptTag = tags.png?.prompt || tags.pngText?.prompt;
      const workflowTag = tags.png?.workflow || tags.pngText?.workflow;

      if (parametersTag || promptTag || workflowTag) {
        let rawPromptText = '';
        if (parametersTag) {
          rawPromptText = parametersTag.description || String(parametersTag.value || '');
        } else if (promptTag) {
          rawPromptText = promptTag.description || String(promptTag.value || '');
        }

        let negativePrompt = '';
        let model = '';
        let seed = '';
        let steps = '';
        let sampler = '';

        // Extract Stable Diffusion / A1111 formatting
        if (rawPromptText.includes('Negative prompt:')) {
          const parts = rawPromptText.split('Negative prompt:');
          const positive = parts[0].trim();
          const rest = parts[1] || '';
          const negParts = rest.split(/(?:Steps:|Model:|Seed:|Sampler:)/);
          negativePrompt = (negParts[0] || '').trim();

          const modelMatch = rest.match(/Model:\s*([^,\n]+)/);
          if (modelMatch) model = modelMatch[1].trim();

          const seedMatch = rest.match(/Seed:\s*(\d+)/);
          if (seedMatch) seed = seedMatch[1].trim();

          const stepsMatch = rest.match(/Steps:\s*(\d+)/);
          if (stepsMatch) steps = stepsMatch[1].trim();

          const samplerMatch = rest.match(/Sampler:\s*([^,\n]+)/);
          if (samplerMatch) sampler = samplerMatch[1].trim();

          aiMetadata = {
            isAiGenerated: true,
            generator: 'Stable Diffusion / A1111',
            positivePrompt: positive,
            negativePrompt,
            model,
            seed,
            steps,
            sampler,
            rawText: rawPromptText.slice(0, 1000)
          };
        } else if (workflowTag) {
          aiMetadata = {
            isAiGenerated: true,
            generator: 'ComfyUI Workflow',
            positivePrompt: 'ComfyUI Node Graph Data Detected',
            rawText: 'ComfyUI JSON graph embedded in PNG'
          };
        } else if (rawPromptText) {
          aiMetadata = {
            isAiGenerated: true,
            generator: 'AI Synthesis',
            positivePrompt: rawPromptText.slice(0, 1000),
            rawText: rawPromptText.slice(0, 1000)
          };
        }
      }

      // 2. Camera EXIF info
      if (tags.exif) {
        const make = tags.exif.Make?.description || '';
        const model = tags.exif.Model?.description || '';
        const date = tags.exif.DateTimeOriginal?.description || tags.exif.DateTime?.description || '';
        const iso = tags.exif.ISOSpeedRatings?.description || '';
        const fNumber = tags.exif.FNumber?.description || '';
        const expTime = tags.exif.ExposureTime?.description || '';

        if (make || model || date) {
          cameraMetadata = {
            make,
            model,
            date,
            iso,
            fNumber,
            exposureTime: expTime
          };
        }
      }

      // 3. Privacy GPS check
      if (tags.gps && (tags.gps.Latitude || tags.gps.Longitude)) {
        hasGps = true;
      }

      return {
        success: true,
        path: resolved,
        fileName: path.basename(resolved),
        ext,
        aiMetadata,
        cameraMetadata,
        hasGps
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = { ImageMetadataInspector };
