import { Address, BigInt, log } from '@graphprotocol/graph-ts'

import {
  BettorWin,
  Freebet,
  FreeBetMinted,
  FreeBetMintedBatch,
  FreeBetRedeemed,
  FreeBetReissued,
  Transfer,
} from '../../generated/FreebetV2_1/Freebet'
import { Bet, CoreContract, FreebetContract, LiquidityPoolContract } from '../../generated/schema'
import { createEvent } from '../common/events'
import {
  createFreebet,
  createFreebetContract,
  redeemFreebet,
  reissueFreebet,
  transferFreebet,
  withdrawFreebet,
} from '../common/freebets'
import { getBetEntityId } from '../utils/schema'


function getOrCreateFreebetContract(freebetContractAddress: Address): FreebetContract | null {
  let freebetContractEntity = FreebetContract.load(freebetContractAddress.toHexString())

  if (freebetContractEntity) {
    return freebetContractEntity
  }

  const freebetSC = Freebet.bind(freebetContractAddress)

  const lp = freebetSC.try_lp()

  if (lp.reverted) {
    log.error('v2 getOrCreateFreebetContract lp call reverted.', [])

    return null
  }

  const name = freebetSC.try_name()

  if (name.reverted) {
    log.error('v2 getOrCreateFreebetContract name call reverted.', [])

    return null
  }

  return createFreebetContract(freebetContractAddress.toHexString(), lp.value.toHexString(), name.value.toString())
}

export function handleFreeBetMinted(event: FreeBetMinted): void {
  createEvent(
    'FreeBetMinted',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'freebetId',
    event.params.id.toString(),
  )

  const freebetContractEntity = getOrCreateFreebetContract(event.address)!
  const liquidityPoolContractEntity = LiquidityPoolContract.load(freebetContractEntity.liquidityPool)!

  createFreebet(
    true,
    freebetContractEntity.id,
    event.address.toHexString(),
    freebetContractEntity.name,
    event.params.id,
    event.params.receiver.toHexString(),
    event.params.bet.amount,
    liquidityPoolContractEntity.tokenDecimals,
    event.params.bet.minOdds,
    event.params.bet.durationTime,
    event.transaction.hash.toHexString(),
    event.block,
  )
}

export function handleFreeBetMintedBatch(event: FreeBetMintedBatch): void {
  const freebetContractEntity = getOrCreateFreebetContract(event.address)!
  const liquidityPoolContractEntity = LiquidityPoolContract.load(freebetContractEntity.liquidityPool)!

  for (let i = 0; i < event.params.ids.length; i++) {
    // parse FreeBetMintedBatch to multiple FreeBetMinted
    const fakeLogIndex = event.logIndex.plus(BigInt.fromI32(i))

    createEvent(
      'FreeBetMinted',
      event.address,
      event.transaction.hash.toHexString(),
      event.transaction.index,
      fakeLogIndex,
      event.block,
      'freebetId',
      event.params.ids[i].toString(),
    )

    createFreebet(
      true,
      freebetContractEntity.id,
      event.address.toHexString(),
      freebetContractEntity.name,
      event.params.ids[i],
      event.params.receivers[i].toHexString(),
      event.params.bets[i].amount,
      liquidityPoolContractEntity.tokenDecimals,
      event.params.bets[i].minOdds,
      event.params.bets[i].durationTime,
      event.transaction.hash.toHexString(),
      event.block,
    )
  }
}

export function handleFreeBetReissued(event: FreeBetReissued): void {
  createEvent(
    'FreeBetReissued',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'freebetId',
    event.params.id.toString(),
  )

  reissueFreebet(event.address.toHexString(), event.params.id, event.block)
}

export function handleFreeBetRedeemed(event: FreeBetRedeemed): void {
  const coreContractEntity = CoreContract.load(event.params.core.toHexString())

  if (!coreContractEntity) {
    log.error('v2 handleFreeBetRedeemed coreContractEntity not found. coreContractEntityId = {}', [
      event.params.core.toHexString(),
    ])

    return
  }

  const freebetEntity = redeemFreebet(
    event.address.toHexString(),
    event.params.id,
    coreContractEntity.id,
    event.params.azuroBetId,
    event.block,
  )

  if (!freebetEntity) {
    log.error('v2 handleFreeBetRedeemed freebetEntity not found. freebetId = {}', [event.params.id.toString()])

    return
  }

  const betEntityId = getBetEntityId(freebetEntity.core!, event.params.azuroBetId.toString())
  const betEntity = Bet.load(betEntityId)

  if (!betEntity) {
    log.error('v2 handleFreeBetRedeemed betEntity not found. betEntity = {}', [betEntityId])

    return
  }

  betEntity.freebet = freebetEntity.id
  betEntity._isFreebet = true
  betEntity.bettor = freebetEntity.owner
  betEntity.actor = freebetEntity.owner
  betEntity._updatedAt = event.block.timestamp

  betEntity.save()
}

export function handleBettorWin(event: BettorWin): void {
  const coreContractEntity = CoreContract.load(event.params.core.toHexString())

  if (!coreContractEntity) {
    log.error('v2 handleBettorWin coreContractEntity not found. coreContractEntityId = {}', [
      event.params.core.toHexString(),
    ])

    return
  }

  const betEntityId = getBetEntityId(coreContractEntity.id, event.params.azuroBetId.toString())
  const betEntity = Bet.load(betEntityId)

  if (!betEntity) {
    log.error('v2 handleBettorWin betEntity not found. betEntity = {}', [betEntityId])

    return
  }

  const freebetEntityId = betEntity.freebet!

  const freebetEntity = withdrawFreebet(freebetEntityId, event.block)

  if (!freebetEntity) {
    log.error('v2 handleBettorWin freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return
  }

  createEvent(
    'FreeBetBettorWin',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'freebetId',
    freebetEntity.freebetId.toString(),
  )
}

export function handleTransfer(event: Transfer): void {
  const freebetEntity = transferFreebet(
    event.address.toHexString(),
    event.params.tokenId,
    event.params.from,
    event.params.to,
    event.block,
  )

  if (freebetEntity) {
    createEvent(
      'FreeBetTransfer',
      event.address,
      event.transaction.hash.toHexString(),
      event.transaction.index,
      event.logIndex,
      event.block,
      'freebetId',
      event.params.tokenId.toString(),
    )
  }
}
