import Web3 from "web3";
import pLimit from "p-limit";
import fs from "fs/promises";
import path from "path";
import esMain from "es-main";

const OCB_CONTRACT = "0xBE82b9533Ddf0ACaDdcAa6aF38830ff4B919482C";
const OCB_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

function decodeDataUrl(dataUrl) {
  return atob(dataUrl.split(",", 2)[1]);
}

async function getOcbSvg(ocbContract, birdNumber) {
  const metaUrl = await ocbContract.methods
    .tokenURI(birdNumber)
    .call({ gas: 300e6 });
  const meta = JSON.parse(decodeDataUrl(metaUrl));
  return decodeDataUrl(meta.image);
}

async function main() {
  if (!process.env.WEB3_RPC_URL)
    throw new Error("WEB_RPC_URL environment variable is not set");
  const web3 = new Web3(
    new Web3.providers.HttpProvider(process.env.WEB3_RPC_URL)
  );
  const ocbContract = new web3.eth.Contract(OCB_ABI, OCB_CONTRACT);
  const throttle = pLimit(10);

  async function fetchAndWriteOcbSvg(birdNumber) {
    const file = path.join("svg", `${birdNumber}.svg`);
    try {
      console.log(file);
      await fs.writeFile(file, await getOcbSvg(ocbContract, birdNumber));
    } catch (e) {
      console.error(`error: failed to generate & save ${file}: ${e}`);
    }
  }

  await fs.mkdir("svg", { recursive: true });
  const existing = new Set(await fs.readdir("svg"));
  const missing = [...Array(10000).keys()].filter(
    (n) => !existing.has(`${n}.svg`)
  );

  console.error(`${missing.length} birds to generate`);
  await Promise.all(missing.map((n) => throttle(() => fetchAndWriteOcbSvg(n))));
}

if (esMain(import.meta)) {
  main().catch((e) => {
    console.error(e);
  });
}
