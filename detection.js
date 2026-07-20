const METHOD_BITS = Object.freeze({
  brightness: 1,
  color: 2,
  background: 4,
});

const METHOD_NAMES = Object.freeze(
  Object.entries(METHOD_BITS).map(([name, bit]) => ({ name, bit })),
);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseHexColor(hex) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "ff3b30";
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function methodNamesFromBits(bits) {
  return METHOD_NAMES.filter(({ bit }) => (bits & bit) !== 0).map(({ name }) => name);
}

class PropDetector {
  constructor({ maxProcessingWidth = 480 } = {}) {
    this.maxProcessingWidth = maxProcessingWidth;
    this.processingCanvas = document.createElement("canvas");
    this.processingContext = this.processingCanvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    this.maskCanvas = document.createElement("canvas");
    this.maskContext = this.maskCanvas.getContext("2d");
    this.backgroundPixels = null;
    this.backgroundWidth = 0;
    this.backgroundHeight = 0;
  }

  get hasBackground() {
    return Boolean(this.backgroundPixels);
  }

  resetBackground() {
    this.backgroundPixels = null;
    this.backgroundWidth = 0;
    this.backgroundHeight = 0;
  }

  reset() {
    this.resetBackground();
    this.processingContext.clearRect(
      0,
      0,
      this.processingCanvas.width,
      this.processingCanvas.height,
    );
    this.maskContext.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
  }

  ensureProcessingSize(sourceWidth, sourceHeight) {
    if (!sourceWidth || !sourceHeight) {
      return false;
    }

    const scale = Math.min(1, this.maxProcessingWidth / sourceWidth);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    if (this.processingCanvas.width === width && this.processingCanvas.height === height) {
      return true;
    }

    this.processingCanvas.width = width;
    this.processingCanvas.height = height;
    this.maskCanvas.width = width;
    this.maskCanvas.height = height;
    this.resetBackground();
    return true;
  }

  acquireFrame(video) {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    if (!this.ensureProcessingSize(sourceWidth, sourceHeight)) {
      return null;
    }

    const width = this.processingCanvas.width;
    const height = this.processingCanvas.height;
    this.processingContext.drawImage(video, 0, 0, width, height);

    return {
      imageData: this.processingContext.getImageData(0, 0, width, height),
      width,
      height,
      sourceWidth,
      sourceHeight,
    };
  }

  captureBackground(video) {
    const frame = this.acquireFrame(video);

    if (!frame) {
      return false;
    }

    this.backgroundPixels = new Uint8ClampedArray(frame.imageData.data);
    this.backgroundWidth = frame.width;
    this.backgroundHeight = frame.height;
    return true;
  }

  sampleColor(video, normalizedX, normalizedY) {
    const frame = this.acquireFrame(video);

    if (!frame) {
      return null;
    }

    const x = clamp(Math.round(normalizedX * (frame.width - 1)), 0, frame.width - 1);
    const y = clamp(Math.round(normalizedY * (frame.height - 1)), 0, frame.height - 1);
    const radius = 2;
    let red = 0;
    let green = 0;
    let blue = 0;
    let samples = 0;

    for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(frame.height - 1, y + radius); sampleY += 1) {
      for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(frame.width - 1, x + radius); sampleX += 1) {
        const index = (sampleY * frame.width + sampleX) * 4;
        red += frame.imageData.data[index];
        green += frame.imageData.data[index + 1];
        blue += frame.imageData.data[index + 2];
        samples += 1;
      }
    }

    return rgbToHex({
      r: red / samples,
      g: green / samples,
      b: blue / samples,
    });
  }

  detect(video, settings) {
    const startedAt = performance.now();
    const frame = this.acquireFrame(video);

    if (!frame) {
      return null;
    }

    const { imageData, width, height, sourceWidth, sourceHeight } = frame;
    const pixelCount = width * height;
    const binaryMask = new Uint8Array(pixelCount);
    const methodMask = new Uint8Array(pixelCount);
    const scoreMap = new Float32Array(pixelCount);
    const target = parseHexColor(settings.targetColor);
    const sensitivityOffset = settings.sensitivity - 50;
    const brightnessThreshold = clamp(
      settings.brightnessThreshold - sensitivityOffset * 0.65,
      0,
      255,
    );
    const colorTolerance = clamp(
      settings.colorTolerance * (0.72 + settings.sensitivity / 180),
      0,
      255,
    );
    const backgroundThreshold = clamp(
      96 - settings.backgroundStrength * 0.78 - sensitivityOffset * 0.22,
      4,
      120,
    );
    const backgroundAvailable =
      settings.backgroundEnabled &&
      this.backgroundPixels &&
      this.backgroundWidth === width &&
      this.backgroundHeight === height;
    const enabledMethods = [
      settings.brightnessEnabled ? METHOD_BITS.brightness : 0,
      settings.colorEnabled ? METHOD_BITS.color : 0,
      settings.backgroundEnabled ? METHOD_BITS.background : 0,
    ].filter(Boolean);

    if (enabledMethods.length > 0) {
      const source = imageData.data;
      const background = this.backgroundPixels;

      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const index = pixel * 4;
        const red = source[index];
        const green = source[index + 1];
        const blue = source[index + 2];
        let matchedBits = 0;
        let scoreTotal = 0;
        let scoreContributors = 0;

        if (settings.brightnessEnabled) {
          const brightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;
          if (brightness >= brightnessThreshold) {
            matchedBits |= METHOD_BITS.brightness;
            scoreTotal += clamp(
              0.45 + (brightness - brightnessThreshold) / Math.max(1, 255 - brightnessThreshold) * 0.55,
              0,
              1,
            );
            scoreContributors += 1;
          }
        }

        if (settings.colorEnabled) {
          const redDifference = red - target.r;
          const greenDifference = green - target.g;
          const blueDifference = blue - target.b;
          const colorDistance = Math.sqrt(
            (redDifference * redDifference +
              greenDifference * greenDifference +
              blueDifference * blueDifference) /
              3,
          );

          if (colorDistance <= colorTolerance) {
            matchedBits |= METHOD_BITS.color;
            scoreTotal += clamp(1 - colorDistance / Math.max(1, colorTolerance), 0, 1);
            scoreContributors += 1;
          }
        }

        if (backgroundAvailable) {
          const redDifference = red - background[index];
          const greenDifference = green - background[index + 1];
          const blueDifference = blue - background[index + 2];
          const frameDifference = Math.sqrt(
            (redDifference * redDifference +
              greenDifference * greenDifference +
              blueDifference * blueDifference) /
              3,
          );

          if (frameDifference >= backgroundThreshold) {
            matchedBits |= METHOD_BITS.background;
            scoreTotal += clamp(
              0.4 + (frameDifference - backgroundThreshold) / Math.max(1, 255 - backgroundThreshold) * 0.6,
              0,
              1,
            );
            scoreContributors += 1;
          }
        }

        const matchedCount = enabledMethods.reduce(
          (total, bit) => total + ((matchedBits & bit) !== 0 ? 1 : 0),
          0,
        );
        const accepted =
          settings.combination === "all"
            ? matchedCount === enabledMethods.length
            : matchedCount > 0;

        if (accepted) {
          binaryMask[pixel] = 1;
          methodMask[pixel] = matchedBits;
          scoreMap[pixel] = scoreContributors > 0 ? scoreTotal / scoreContributors : 0;
        }
      }
    }

    this.removeIsolatedPixels(binaryMask, width, height);
    const detections = this.extractRegions({
      binaryMask,
      methodMask,
      scoreMap,
      width,
      height,
      sourceWidth,
      sourceHeight,
      minRegionPercent: settings.minRegionPercent,
      maxRegionPercent: settings.maxRegionPercent,
    });

    if (settings.showMask) {
      this.renderDebugMask(binaryMask, methodMask, width, height);
    } else {
      this.maskContext.clearRect(0, 0, width, height);
    }

    return {
      detections,
      maskCanvas: settings.showMask ? this.maskCanvas : null,
      processingWidth: width,
      processingHeight: height,
      sourceWidth,
      sourceHeight,
      backgroundAvailable,
      enabledMethods: enabledMethods.map((bit) => methodNamesFromBits(bit)[0]),
      processingTimeMs: performance.now() - startedAt,
    };
  }

  removeIsolatedPixels(mask, width, height) {
    const isolatedPixels = [];

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;

        if (!mask[index]) {
          continue;
        }

        let neighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) {
              continue;
            }
            neighbors += mask[(y + offsetY) * width + x + offsetX];
          }
        }

        if (neighbors < 2) {
          isolatedPixels.push(index);
        }
      }
    }

    for (const index of isolatedPixels) {
      mask[index] = 0;
    }
  }

  extractRegions({
    binaryMask,
    methodMask,
    scoreMap,
    width,
    height,
    sourceWidth,
    sourceHeight,
    minRegionPercent,
    maxRegionPercent,
  }) {
    const visited = new Uint8Array(binaryMask.length);
    const queue = new Int32Array(binaryMask.length);
    const frameArea = width * height;
    const minArea = Math.max(1, frameArea * (minRegionPercent / 100));
    const maxArea = Math.max(minArea, frameArea * (maxRegionPercent / 100));
    const scaleX = sourceWidth / width;
    const scaleY = sourceHeight / height;
    const detections = [];

    for (let start = 0; start < binaryMask.length; start += 1) {
      if (!binaryMask[start] || visited[start]) {
        continue;
      }

      let queueStart = 0;
      let queueEnd = 0;
      queue[queueEnd] = start;
      queueEnd += 1;
      visited[start] = 1;

      let area = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let scoreTotal = 0;
      let contributingBits = 0;

      while (queueStart < queueEnd) {
        const index = queue[queueStart];
        queueStart += 1;
        const x = index % width;
        const y = Math.floor(index / width);

        area += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        scoreTotal += scoreMap[index];
        contributingBits |= methodMask[index];

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const neighborY = y + offsetY;
          if (neighborY < 0 || neighborY >= height) {
            continue;
          }

          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) {
              continue;
            }

            const neighborX = x + offsetX;
            if (neighborX < 0 || neighborX >= width) {
              continue;
            }

            const neighborIndex = neighborY * width + neighborX;
            if (binaryMask[neighborIndex] && !visited[neighborIndex]) {
              visited[neighborIndex] = 1;
              queue[queueEnd] = neighborIndex;
              queueEnd += 1;
            }
          }
        }
      }

      if (area < minArea || area > maxArea) {
        continue;
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const boundingArea = boxWidth * boxHeight;
      const fillRatio = area / boundingArea;
      const aspectRatio = Math.max(boxWidth / boxHeight, boxHeight / boxWidth);

      if (fillRatio < 0.055 || aspectRatio > 14 || (aspectRatio > 8 && fillRatio < 0.12)) {
        continue;
      }

      const averageSignalScore = scoreTotal / area;
      const confidence = clamp(
        averageSignalScore * 0.76 + fillRatio * 0.18 + Math.min(1, area / (minArea * 3)) * 0.06,
        0,
        1,
      );
      const methods = methodNamesFromBits(contributingBits);

      detections.push({
        x: ((minX + maxX + 1) / 2) * scaleX,
        y: ((minY + maxY + 1) / 2) * scaleY,
        width: boxWidth * scaleX,
        height: boxHeight * scaleY,
        area: area * scaleX * scaleY,
        score: confidence,
        confidence,
        method: methods.join("+") || "combined",
        methods,
      });
    }

    detections.sort((first, second) => second.score - first.score);
    return detections;
  }

  renderDebugMask(binaryMask, methodMask, width, height) {
    const debugImage = this.maskContext.createImageData(width, height);

    for (let pixel = 0; pixel < binaryMask.length; pixel += 1) {
      if (!binaryMask[pixel]) {
        continue;
      }

      const index = pixel * 4;
      const methods = methodMask[pixel];
      debugImage.data[index] = methods & METHOD_BITS.color ? 255 : 94;
      debugImage.data[index + 1] = methods & METHOD_BITS.brightness ? 235 : 118;
      debugImage.data[index + 2] = methods & METHOD_BITS.background ? 255 : 168;
      debugImage.data[index + 3] = 210;
    }

    this.maskContext.putImageData(debugImage, 0, 0);
  }
}
