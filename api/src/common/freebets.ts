import { Address, BigInt, ethereum, log } from '@graphprotocol/graph-ts'

import { Bet, Freebet, FreebetContract, LiquidityPoolContract } from '../../generated/schema'
import {
  BASES_VERSIONS,
  FREEBET_STATUS_CREATED,
  FREEBET_STATUS_REDEEMED,
  FREEBET_STATUS_REISSUED,
  FREEBET_STATUS_WITHDRAWN,
} from '../constants'
import { toDecimal } from '../utils/math'
import { getBetEntityId, getFreebetEntityId } from '../utils/schema'


export function createFreebetContractEntity(
  freebetContractAddress: string,
  liquidityPoolAddress: string,
  freebetContractName: string | null,
  freebetContractAffiliate: string | null,
  freebetContractManager: string | null,
): FreebetContract | null {
  const freebetContractEntity = new FreebetContract(freebetContractAddress)

  const liquidityPoolContractEntity = LiquidityPoolContract.load(liquidityPoolAddress)

  // TODO remove later
  if (!liquidityPoolContractEntity) {
    log.error('createFreebetContract liquidityPoolContractEntity not found. liquidityPoolAddress = {}', [
      liquidityPoolAddress,
    ])

    return null
  }

  freebetContractEntity.liquidityPool = liquidityPoolContractEntity.id
  freebetContractEntity.address = freebetContractAddress

  if (freebetContractName !== null) {
    freebetContractEntity.name = freebetContractName
  }

  if (freebetContractAffiliate !== null) {
    freebetContractEntity.affiliate = freebetContractAffiliate
  }

  if (freebetContractManager !== null) {
    freebetContractEntity.manager = freebetContractManager
  }

  freebetContractEntity.save()

  return freebetContractEntity
}

export function createFreebet(
  version: string,
  freebetContractEntityId: string,
  freebetContractAddress: string,
  freebetContractName: string | null,
  freebetContractAffiliate: string | null,
  freebetId: BigInt,
  owner: string,
  amount: BigInt,
  tokenDecimals: i32,
  minOdds: BigInt,
  durationTime: BigInt,
  txHash: string,
  coreAddress: string | null,
  azuroBetId: BigInt | null,
  createBlock: ethereum.Block,
): Freebet {
  const freebetEntityId = getFreebetEntityId(freebetContractAddress, freebetId.toString())

  const freebetEntity = new Freebet(freebetEntityId)

  freebetEntity.freebet = freebetContractEntityId
  freebetEntity.freebetContractAddress = freebetContractAddress

  if (freebetContractName !== null) {
    freebetEntity.freebetContractName = freebetContractName
  }

  freebetEntity.freebetId = freebetId

  if (freebetContractAffiliate !== null) {
    freebetEntity.freebetContractAffiliate = freebetContractAffiliate
  }

  freebetEntity.owner = owner

  if (coreAddress !== null && azuroBetId !== null) {
    freebetEntity.azuroBetId = azuroBetId
    freebetEntity.status = FREEBET_STATUS_REDEEMED.toString()
    freebetEntity.core = coreAddress
  }
  else {
    freebetEntity.status = FREEBET_STATUS_CREATED.toString()
  }

  freebetEntity.rawAmount = amount
  freebetEntity.amount = toDecimal(freebetEntity.rawAmount, tokenDecimals)
  freebetEntity.tokenDecimals = tokenDecimals
  freebetEntity.rawMinOdds = minOdds

  freebetEntity.minOdds = toDecimal(freebetEntity.rawMinOdds, BASES_VERSIONS.mustGetEntry(version).value)
  freebetEntity.durationTime = durationTime
  freebetEntity.expiresAt = freebetEntity.durationTime.plus(createBlock.timestamp)

  freebetEntity.createdTxHash = txHash

  freebetEntity.createdBlockNumber = createBlock.number
  freebetEntity.createdBlockTimestamp = createBlock.timestamp
  freebetEntity.burned = false
  freebetEntity.isResolved = false

  freebetEntity._updatedAt = createBlock.timestamp

  freebetEntity.save()

  return freebetEntity
}

export function reissueFreebet(
  freebetContractAddress: string,
  freebetId: BigInt,
  reissueBlock: ethereum.Block,
): Freebet | null {
  const freebetEntityId = getFreebetEntityId(freebetContractAddress, freebetId.toString())

  const freebetEntity = Freebet.load(freebetEntityId)

  // TODO remove later
  if (!freebetEntity) {
    log.error('reissueFreebet freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return null
  }

  freebetEntity.expiresAt = freebetEntity.durationTime.plus(reissueBlock.timestamp)
  freebetEntity.status = FREEBET_STATUS_REISSUED.toString()
  freebetEntity.core = null
  freebetEntity.azuroBetId = null
  freebetEntity._updatedAt = reissueBlock.timestamp

  freebetEntity.save()

  return freebetEntity
}

export function redeemFreebet(
  freebetContractAddress: string,
  freebetId: BigInt,
  coreAddress: string,
  azuroBetId: BigInt,
  block: ethereum.Block,
): Freebet | null {
  const freebetEntityId = getFreebetEntityId(freebetContractAddress, freebetId.toString())

  const freebetEntity = Freebet.load(freebetEntityId)

  // TODO remove later
  if (!freebetEntity) {
    log.error('redeemFreebet freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return null
  }

  freebetEntity.azuroBetId = azuroBetId
  freebetEntity.status = FREEBET_STATUS_REDEEMED.toString()
  freebetEntity.core = coreAddress
  freebetEntity._updatedAt = block.timestamp

  freebetEntity.save()

  return freebetEntity
}

export function withdrawFreebet(freebetEntityId: string, block: ethereum.Block): Freebet | null {
  const freebetEntity = Freebet.load(freebetEntityId)

  // TODO remove later
  if (!freebetEntity) {
    log.error('withdrawFreebet freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return null
  }

  freebetEntity.status = FREEBET_STATUS_WITHDRAWN.toString()
  freebetEntity._updatedAt = block.timestamp

  freebetEntity.save()

  return freebetEntity
}

export function transferFreebet(
  freebetContractAddress: string,
  tokenId: BigInt,
  to: Address,
  block: ethereum.Block,
): Freebet | null {

  const freebetEntityId = getFreebetEntityId(freebetContractAddress, tokenId.toString())
  const freebetEntity = Freebet.load(freebetEntityId)

  // TODO remove later
  if (!freebetEntity) {
    log.error('transferFreebet freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return null
  }

  freebetEntity.owner = to.toHexString()

  freebetEntity._updatedAt = block.timestamp
  freebetEntity.save()

  const coreAddress = freebetEntity.core
  const azuroBetId = freebetEntity.azuroBetId

  if (coreAddress !== null && azuroBetId !== null) {
    const betEntityId = getBetEntityId(coreAddress, azuroBetId.toString())
    const betEntity = Bet.load(betEntityId)

    // TODO remove later
    if (!betEntity) {
      log.error('transferFreebet betEntity not found. betEntityId = {}', [betEntityId])

      return null
    }

    betEntity.actor = to.toHexString()
    betEntity._updatedAt = block.timestamp
    betEntity.save()
  }

  return freebetEntity
}

export function resolveFreebet(
  freebetContractAddress: string,
  tokenId: BigInt,
  burned: boolean,
  block: ethereum.Block,
): Freebet | null {

  const freebetEntityId = getFreebetEntityId(freebetContractAddress, tokenId.toString())
  const freebetEntity = Freebet.load(freebetEntityId)

  // TODO remove later
  if (!freebetEntity) {
    log.error('resolveFreebet freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return null
  }

  freebetEntity.isResolved = true

  if (burned) {
    freebetEntity.burned = true
  }

  freebetEntity._updatedAt = block.timestamp
  freebetEntity.save()

  return freebetEntity
}
