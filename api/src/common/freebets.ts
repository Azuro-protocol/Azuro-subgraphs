import { Address, BigInt, ethereum, log } from '@graphprotocol/graph-ts'

import { Bet, Freebet, FreebetContract, LiquidityPoolContract } from '../../generated/schema'
import {
  FREEBET_STATUS_CREATED,
  FREEBET_STATUS_REDEEMED,
  FREEBET_STATUS_REISSUED,
  FREEBET_STATUS_WITHDRAWN,
  V1_BASE,
  V2_BASE,
} from '../constants'
import { toDecimal } from '../utils/math'
import { getBetEntityId, getFreebetEntityId } from '../utils/schema'


export function createFreebetContract(
  freebetContractAddress: string,
  liquidityPoolAddress: string,
  freebetContractName: string,
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
  freebetContractEntity.name = freebetContractName
  freebetContractEntity.save()

  return freebetContractEntity
}

export function createFreebet(
  isV2: boolean,
  freebetContractEntityId: string,
  freebetContractAddress: string,
  freebetContractName: string,
  freebetId: BigInt,
  owner: string,
  amount: BigInt,
  tokenDecimals: i32,
  minOdds: BigInt,
  durationTime: BigInt,
  txHash: string,
  createBlock: ethereum.Block,
): Freebet {
  const freebetEntityId = getFreebetEntityId(freebetContractAddress, freebetId.toString())

  const freebetEntity = new Freebet(freebetEntityId)

  freebetEntity.freebet = freebetContractEntityId
  freebetEntity.freebetContractAddress = freebetContractAddress
  freebetEntity.freebetContractName = freebetContractName
  freebetEntity.freebetId = freebetId
  freebetEntity.owner = owner

  freebetEntity.status = FREEBET_STATUS_CREATED.toString()

  freebetEntity.rawAmount = amount
  freebetEntity.amount = toDecimal(freebetEntity.rawAmount, tokenDecimals)
  freebetEntity.tokenDecimals = tokenDecimals
  freebetEntity.rawMinOdds = minOdds
  freebetEntity.minOdds = toDecimal(freebetEntity.rawMinOdds, isV2 ? V2_BASE : V1_BASE)
  freebetEntity.durationTime = durationTime
  freebetEntity.expiresAt = freebetEntity.durationTime.plus(createBlock.timestamp)

  freebetEntity.createdTxHash = txHash

  freebetEntity.createdBlockNumber = createBlock.number
  freebetEntity.createdBlockTimestamp = createBlock.timestamp
  freebetEntity.burned = false

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
  from: Address,
  to: Address,
  block: ethereum.Block,
): Freebet | null {
  // create nft
  if (from.equals(Address.zero())) {
    return null
  }

  const freebetEntityId = getFreebetEntityId(freebetContractAddress, tokenId.toString())

  const freebetEntity = Freebet.load(freebetEntityId)

  // TODO remove later
  if (!freebetEntity) {
    log.error('transferFreebet freebetEntity not found. freebetEntityId = {}', [freebetEntityId])

    return null
  }

  // burn nft
  if (to.equals(Address.zero())) {
    freebetEntity.burned = true
  }
  else {
    freebetEntity.owner = to.toHexString()
  }

  freebetEntity._updatedAt = block.timestamp
  freebetEntity.save()

  const coreAddress = freebetEntity.core
  const azuroBetId = freebetEntity.azuroBetId

  if (to.notEqual(Address.zero()) && coreAddress !== null && azuroBetId !== null) {
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

  if (to.equals(Address.zero())) {
    // do not create freebet transfer event
    return null
  }

  return freebetEntity
}
