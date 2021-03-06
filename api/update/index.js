/*
Should download the version JSON file from the VSCodium repo
the JSON file should conform to this schema:
{
  "url": "<url to release download>",
  "name": "1.33.1", // the version number
  "version": "51b0b28134d51361cf996d2f0a1c698247aeabd8", // the latest commit hash
  "productVersion": "1.33.1", // the version number
  "hash": "cb4109f196d23b9d1e8646ce43145c5bb62f55a8", // sha1 of the release download
  "timestamp": 1554971059007,
  "sha256hash": "ac2a1c8772501732cd5ff539a04bb4dc566b58b8528609d2b34bbf970d08cf01" // sha256 of the release download
}
The hashes can be ignored by this api/lambda -- we are only concerned with whether
the commit hash in the url parameter matches the "version" identifier in the above payload
*/


const { parse } = require('url')
const got = require('got')

const STABLE = 'stable'

const DARWIN = 'darwin'
const WINDOWS = 'win32'
const LINUX = 'linux'

const IA32 = 'ia32'
const X64 = 'x64'

const SYSTEM = 'system'
const ARCHIVE = 'archive'
const USER = 'user'

const QUALITIES = new Set([STABLE])
const OS = new Set([DARWIN, WINDOWS, LINUX])
const TYPES = new Set([ARCHIVE, SYSTEM, USER])
const ARCH = new Set([IA32, X64])

const VERSION_BASE_URL = 'https://raw.githubusercontent.com/VSCodium/versions/master'

async function getJSON ({ os, arch, type }) {
  // get os/arch/type specific JSON file from a repo where these files are stored
  let versionUrl = `${VERSION_BASE_URL}/${os}`

  if (arch) versionUrl += `/${arch}`
  if (type) versionUrl += `/${type}`

  try {
    const response = await got(`${versionUrl}/latest.json`, { json: true })
    if (!response.body) return null
    return response.body
  } catch (e) {
    return null
  }
}

// returns false if invalid, or an object of os, arch, type if valid
function validateInput (platform, quality) {
  // a bunch of validation rules for the different permutations
  if (!QUALITIES.has(quality)) return false

  let [os, arch, type] = platform.split('-')
  if (!OS.has(os)) return false

  if (os === WINDOWS && arch === X64 && !type) type = SYSTEM

  if (os === WINDOWS && !arch && !type) arch = SYSTEM

  if (os === WINDOWS && !type) {
    type = arch
    arch = IA32
  }

  if (os === WINDOWS || os === LINUX) {
    if (!ARCH.has(arch)) return false
  }

  if (os === WINDOWS && !TYPES.has(type)) return false

  return { os, arch, type }
}

module.exports = async (req, res) => {
  const { query } = parse(req.url, true)
  const { platform, quality, commit } = query
  const input = validateInput(platform, quality)
  if (!input) {
    res.writeHead(404)
    res.end()
    return
  }

  const { os, arch, type } = input
  const latest = await getJSON({ os, arch, type })

  // vercel supports cache-control header; we can use this to cut down on cost
  // currently set to cache for 4hrs
  res.setHeader('cache-control', 's-maxage=14400')
  if (!latest || commit === latest.version) {
    res.writeHead(204)
    res.end()
    return
  }
  res.setHeader('Content-Type', 'application/json')
  res.write(JSON.stringify(latest))
  res.end()
}
