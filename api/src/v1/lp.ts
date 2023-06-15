import { Address, BigInt, log } from '@graphprotocol/graph-ts'

import { Condition, LiquidityPoolContract, Outcome } from '../../generated/schema'
import {
  BetterWin,
  LiquidityAdded,
  LiquidityRemoved,
  LiquidityRemoved1,
  LPV1 as LPV1Abi,
  NewBet,
  Transfer,
  WithdrawTimeoutChanged,
} from '../../generated/templates/LPV1/LPV1'
import { bettorWin, createBet } from '../common/bets'
import { createEvent } from '../common/events'
import { changeWithdrawalTimeout, depositLiquidity, transferLiquidity, withdrawLiquidity } from '../common/pool'
import { BET_TYPE_ORDINAR } from '../constants'
import { getConditionEntityId, getOutcomeEntityId } from '../utils/schema'


export function handleNewBet(event: NewBet): void {
  const liquidityPoolContractEntity = LiquidityPoolContract.load(event.address.toHexString())!
  // hack for V1
  const coreAddress = liquidityPoolContractEntity.coreAddresses![0]

  createEvent(
    'NewBet',
    Address.fromString(coreAddress),
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'betId',
    event.params.betId.toString(),
  )

  const conditionEntityId = getConditionEntityId(coreAddress, event.params.conditionId.toString())
  const conditionEntity = Condition.load(conditionEntityId)

  // TODO remove later
  if (!conditionEntity) {
    log.error('v1 handleNewBet conditionEntity not found. conditionEntityId = {}', [conditionEntityId])

    return
  }

  const outcomeEntityId = getOutcomeEntityId(conditionEntity.id, event.params.outcomeId.toString())
  const outcomeEntity = Outcome.load(outcomeEntityId)!

  createBet(
    false,
    BET_TYPE_ORDINAR.toString(),
    [conditionEntity],
    [outcomeEntity],
    [event.params.odds],
    event.params.odds,
    conditionEntity.coreAddress,
    event.params.owner,
    null,
    event.params.betId,
    liquidityPoolContractEntity.tokenDecimals,
    event.params.amount,
    event.transaction.hash.toHexString(),
    event.block,
    [event.params.fund1, event.params.fund2],
  )
}

export function handleBetterWin(event: BetterWin): void {
  const liquidityPoolContractEntity = LiquidityPoolContract.load(event.address.toHexString())!
  // hack for V1
  const coreAddress = liquidityPoolContractEntity.coreAddresses![0]

  createEvent(
    'BettorWin',
    Address.fromString(coreAddress),
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'betId',
    event.params.tokenId.toString(),
  )

  bettorWin(coreAddress, event.params.tokenId, event.params.amount, event.transaction.hash.toHexString(), event.block)
}

export function handleLiquidityAdded(event: LiquidityAdded): void {
  createEvent(
    'LiquidityAdded',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'leafId',
    event.params.leaf.toString(),
  )

  depositLiquidity(
    event.address.toHexString(),
    event.params.amount,
    event.params.leaf,
    event.params.account.toHexString(),
    event.block,
    event.transaction,
  )
}

export function handleOldLiquidityRemoved(event: LiquidityRemoved1): void {
  const OLD_LIQUIDITY_REMOVED_EVENT_NFT_ID: BigInt = BigInt.fromString('1099511627776')

  createEvent(
    'LiquidityRemoved',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
  )

  let isFullyWithdrawn = false

  const liquidityPoolSC = LPV1Abi.bind(event.address)
  const nodeWithdrawView = liquidityPoolSC.try_nodeWithdrawView(OLD_LIQUIDITY_REMOVED_EVENT_NFT_ID)

  if (!nodeWithdrawView.reverted && nodeWithdrawView.value.equals(BigInt.zero())) {
    isFullyWithdrawn = true
  }

  withdrawLiquidity(
    event.address.toHexString(),
    event.params.amount,
    OLD_LIQUIDITY_REMOVED_EVENT_NFT_ID,
    event.params.account.toHexString(),
    isFullyWithdrawn,
    event.block,
    event.transaction,
  )
}

export function handleLiquidityRemoved(event: LiquidityRemoved): void {
  createEvent(
    'LiquidityRemoved',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'leafId',
    event.params.leaf.toString(),
  )

  let isFullyWithdrawn = false

  const liquidityPoolSC = LPV1Abi.bind(event.address)
  const nodeWithdrawView = liquidityPoolSC.try_nodeWithdrawView(event.params.leaf)

  if (!nodeWithdrawView.reverted && nodeWithdrawView.value.equals(BigInt.zero())) {
    isFullyWithdrawn = true
  }

  withdrawLiquidity(
    event.address.toHexString(),
    event.params.amount,
    event.params.leaf,
    event.params.account.toHexString(),
    isFullyWithdrawn,
    event.block,
    event.transaction,
  )
}

export function handleTransfer(event: Transfer): void {
  if (event.params.from.equals(Address.zero())) {
    return
  }

  createEvent(
    'LiquidityTransfer',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'leafId',
    event.params.tokenId.toString(),
  )

  transferLiquidity(event.address.toHexString(), event.params.tokenId, event.params.to.toHexString())
}

export function handleWithdrawTimeoutChanged(event: WithdrawTimeoutChanged): void {
  changeWithdrawalTimeout(event.address.toHexString(), event.params.newWithdrawTimeout)
}
