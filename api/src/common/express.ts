import { Address, BigInt } from '@graphprotocol/graph-ts'

import { ExpressV1 as Express } from '../../generated/templates/ExpressV1/ExpressV1'


export function calcPayout(address: string, tokenId: BigInt): BigInt | null {
  const expressSC = Express.bind(Address.fromString(address))

  const payout = expressSC.try_calcPayout(tokenId)

  if (!payout.reverted) {
    return payout.value
  }

  return null
}
