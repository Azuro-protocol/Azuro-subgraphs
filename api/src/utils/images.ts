import { BigInt } from '@graphprotocol/graph-ts'

import { AVATARS_PROVIDER_BASE_URLS, CHAINS_IDS } from '../constants'


export function getImageUrl(network: string | null, sportId: BigInt, gameId: BigInt, participantName: string): string | null {

  if (network === null) {
    return null
  }

  let chainId: string | null = null

  if (CHAINS_IDS.isSet(network)) {
    chainId = CHAINS_IDS.mustGet(network)
  }

  if (chainId === null) {
    return null
  }

  let baseUrl: string | null = null

  if (AVATARS_PROVIDER_BASE_URLS.isSet(chainId)) {
    baseUrl = AVATARS_PROVIDER_BASE_URLS.mustGet(chainId)
  }

  if (baseUrl === null) {
    return null
  }

  return baseUrl
    .concat(sportId.toString())
    .concat('/')
    .concat(gameId.toString())
    .concat('/')
    .concat(participantName)
    .concat('.png')

}
