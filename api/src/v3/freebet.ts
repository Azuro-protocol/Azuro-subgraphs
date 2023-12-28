import { log } from '@graphprotocol/graph-ts'

import { CoreContract, Freebet, FreebetContract, LiquidityPoolContract } from '../../generated/schema'
import {
  BettorWin,
  NewBet,
  PayoutsResolved,
} from '../../generated/templates/FreebetV3/FreebetV3'
import { linkBetWithFreeBet } from '../common/bets'
import { createEvent } from '../common/events'
import {
  createFreebet,
  resolveFreebet,
  withdrawFreebet,
} from '../common/freebets'
import { VERSION_V3 } from '../constants'
import { getFreebetEntityId } from '../utils/schema'


export function handleNewBet(event: NewBet): void {

  createEvent(
    'FreeBetRedeemed',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'freebetId',
    event.params.freeBetId.toString(),
  )

  const coreContractEntity = CoreContract.load(event.params.core.toHexString())

  if (!coreContractEntity) {
    log.error('v3 handleNewBet (freebet) coreContractEntity not found. coreContractEntityId = {}', [event.params.core.toHexString()])

    return
  }

  const freebetContractEntity = FreebetContract.load(event.address.toHexString())!
  const liquidityPoolContractEntity = LiquidityPoolContract.load(freebetContractEntity.liquidityPool)!

  const freebetEntity = createFreebet(
    VERSION_V3,
    freebetContractEntity.id,
    event.address.toHexString(),
    freebetContractEntity.name,
    freebetContractEntity.affiliate,
    event.params.freeBetId,
    event.params.bettor.toHexString(),
    event.params.amount,
    liquidityPoolContractEntity.tokenDecimals,
    event.params.minOdds,
    event.block.timestamp.minus(event.params.expiresAt),
    event.transaction.hash.toHexString(),
    coreContractEntity.id,
    event.params.azuroBetId,
    event.block,
  )

  linkBetWithFreeBet(
    coreContractEntity.id,
    event.params.azuroBetId,
    freebetEntity.id,
    freebetEntity.owner,
    event.block,
  )

}

export function handleBettorWin(event: BettorWin): void {

  const coreContractEntity = CoreContract.load(event.params.core.toHexString())

  if (!coreContractEntity) {
    log.error('v3 handleBettorWin coreContractEntity not found. coreContractEntityId = {}', [event.params.core.toHexString()])

    return
  }

  const freebetEntityId = getFreebetEntityId(event.address.toHexString(), event.params.freeBetId.toString())
  const freebetEntity = Freebet.load(freebetEntityId)

  // TODO remove later
  if (!freebetEntity) {
    log.error('v3 handleBettorWin freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return
  }

  withdrawFreebet(freebetEntityId, event.block)

  createEvent(
    'FreeBetBettorWin',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'freebetId',
    freebetEntity.freebetId.toString(),
  )
}

export function handlePayoutsResolved(event: PayoutsResolved): void {

  for (let i = 0; i < event.params.azuroBetId.length; i++) {
    resolveFreebet(
      event.address.toHexString(),
      event.params.azuroBetId[i],
      false,
      event.block,
    )
  }
}
