import fs from "fs/promises";
import path from "path";
import svgToPng from "convert-svg-to-png";
import esMain from "es-main";
import pLimit from "p-limit";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// clases c1 to c131 are background colours
const NO_BACKGROUND_OVERRIDE_STYLE = `${[...Array(131).keys()]
  .map((n) => `.c${n + 1}`)
  .join(",")}{visibility:hidden;}`;

function removeBackground(ocbSvg) {
  return `\
<svg id="bird-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" viewBox="0 0 42 42">\
<style>${NO_BACKGROUND_OVERRIDE_STYLE}</style>\
${ocbSvg}\
</svg>`;
}

async function ocbToPng({ converter, ocbSvg, imageSize, transparent }) {
  if (transparent) {
    ocbSvg = removeBackground(ocbSvg);
  }
  return await converter.convert(ocbSvg, { width: imageSize });
}

async function ocbSvgFileToPngFile({
  converter,
  srcSvgFile,
  destPngFile,
  imageSize,
  transparent,
}) {
  const ocbSvg = await fs.readFile(srcSvgFile, { encoding: "utf-8" });
  await fs.writeFile(
    destPngFile,
    await ocbToPng({ converter, ocbSvg, imageSize, transparent })
  );
}

async function main() {
  const { imageSize, transparent, puppeteerOptions, svgDir } = yargs(
    hideBin(process.argv)
  )
    .option("image-size", {
      demandOption: true,
      number: true,
      desc: "The size of the output PNGs",
    })
    .coerce("image-size", (size) => {
      if (size < 1) throw new Error("--image-size must be >= 1");
      return size;
    })
    .option("transparent", {
      boolean: true,
      desc: "Make the background transparent",
    })
    .option("svg-dir", {
      default: "svg",
      string: true,
    })
    .option("puppeteer-options", {
      string: true,
      default: process.env.PUPPETEER_OPTIONS || "{}",
      desc: "Options to pass to puppeteer.launch() as JSON",
      coerce: JSON.parse,
    }).argv;

  // convert-svg-to-png does not work correctly if concurrent convert() calls
  // are made to the same converter instance.
  const concurrency = 5;
  const throttle = pLimit(concurrency);
  const converters = [...Array(concurrency).keys()].map((n) =>
    svgToPng.createConverter({ puppeteer: puppeteerOptions })
  );

  const outDir = `${imageSize}x${imageSize}${
    transparent ? "-transparent" : ""
  }`;
  await fs.mkdir(outDir, { recursive: true });
  const existing = new Set(await fs.readdir(outDir));
  const missing = [...Array(10000).keys()].filter(
    (n) => !existing.has(`${n}.png`)
  );

  console.error(`${missing.length} birds to generate`);
  try {
    await await Promise.all(
      missing.map((birdNumber, jobNumber) =>
        throttle(() => {
          const converter = converters[jobNumber % concurrency];
          const srcSvgFile = path.join(svgDir, `${birdNumber}.svg`);
          const destPngFile = path.join(outDir, `${birdNumber}.png`);
          console.error(destPngFile);
          return ocbSvgFileToPngFile({
            converter,
            srcSvgFile,
            destPngFile,
            imageSize,
            transparent,
          });
        })
      )
    );
  } finally {
    converters.forEach((c) => c.destroy());
  }
}

if (esMain(import.meta)) {
  main().catch((e) => {
    console.error(e);
  });
}
