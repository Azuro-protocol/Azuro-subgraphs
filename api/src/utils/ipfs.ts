import { ipfs, json, JSONValue, log } from '@graphprotocol/graph-ts'


export function getIPFSJson(ipfsHash: string): JSONValue | null {
  const result = ipfs.cat(ipfsHash)

  if (!result) {
    log.error('getIPFSJson IPFS failed to load. Hash: {}', [ipfsHash])

    return null
  }
  const resultIpfsJson = json.try_fromBytes(result)

  if (!resultIpfsJson.isOk) {
    log.error('getIPFSJson IPFS failed to parse. Hash: {}', [ipfsHash])

    return null
  }

  return resultIpfsJson.value
}
