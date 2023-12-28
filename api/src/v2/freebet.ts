import { Address, BigInt, log } from '@graphprotocol/graph-ts'

import {
  BettorWin,
  FreeBetMinted,
  FreeBetMintedBatch,
  FreeBetRedeemed,
  FreeBetReissued,
  FreebetV2 as Freebet,
  Transfer,
} from '../../generated/FreebetV2_1/FreebetV2'
import { Bet, CoreContract, FreebetContract, LiquidityPoolContract } from '../../generated/schema'
import { linkBetWithFreeBet } from '../common/bets'
import { createEvent } from '../common/events'
import {
  createFreebet,
  createFreebetContractEntity,
  redeemFreebet,
  reissueFreebet,
  resolveFreebet,
  transferFreebet,
  withdrawFreebet,
} from '../common/freebets'
import { VERSION_V2 } from '../constants'
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

  return createFreebetContractEntity(freebetContractAddress.toHexString(), lp.value.toHexString(), name.value.toString(), null, null)
}

export function handleFreeBetMinted(event: FreeBetMinted): void {
  createEvent(
    'FreeBetMinted',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'freebetId',
    event.params.id.toString(),
  )

  const freebetContractEntity = getOrCreateFreebetContract(event.address)

  if (!freebetContractEntity) {
    return
  }

  const liquidityPoolContractEntity = LiquidityPoolContract.load(freebetContractEntity.liquidityPool)!

  createFreebet(
    VERSION_V2,
    freebetContractEntity.id,
    event.address.toHexString(),
    freebetContractEntity.name,
    null,
    event.params.id,
    event.params.receiver.toHexString(),
    event.params.bet.amount,
    liquidityPoolContractEntity.tokenDecimals,
    event.params.bet.minOdds,
    event.params.bet.durationTime,
    event.transaction.hash.toHexString(),
    null,
    null,
    event.block,
  )
}

export function handleFreeBetMintedBatch(event: FreeBetMintedBatch): void {
  const freebetContractEntity = getOrCreateFreebetContract(event.address)

  if (!freebetContractEntity) {
    return
  }

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
      event.transaction.gasPrice,
      event.receipt !== null ? event.receipt!.gasUsed : null,
      'freebetId',
      event.params.ids[i].toString(),
    )

    createFreebet(
      VERSION_V2,
      freebetContractEntity.id,
      event.address.toHexString(),
      freebetContractEntity.name,
      null,
      event.params.ids[i],
      event.params.receivers[i].toHexString(),
      event.params.bets[i].amount,
      liquidityPoolContractEntity.tokenDecimals,
      event.params.bets[i].minOdds,
      event.params.bets[i].durationTime,
      event.transaction.hash.toHexString(),
      null,
      null,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'freebetId',
    freebetEntity.freebetId.toString(),
  )
}

export function handleTransfer(event: Transfer): void {

  // create nft
  if (event.params.from.equals(Address.zero())) {
    return
  }

  // burn nft
  if (event.params.to.equals(Address.zero())) {
    resolveFreebet(
      event.address.toHexString(),
      event.params.tokenId,
      true,
      event.block,
    )
  }
  else {
    transferFreebet(
      event.address.toHexString(),
      event.params.tokenId,
      event.params.to,
      event.block,
    )

    createEvent(
      'FreeBetTransfer',
      event.address,
      event.transaction.hash.toHexString(),
      event.transaction.index,
      event.logIndex,
      event.block,
      event.transaction.gasPrice,
      event.receipt !== null ? event.receipt!.gasUsed : null,
      'freebetId',
      event.params.tokenId.toString(),
    )
  }
}
