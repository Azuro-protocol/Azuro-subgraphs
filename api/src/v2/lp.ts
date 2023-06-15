import { Address, BigInt } from '@graphprotocol/graph-ts'

import {
  BettorWin,
  GameCanceled,
  GameShifted,
  LiquidityAdded,
  LiquidityRemoved,
  LPV2 as LPAbi,
  NewGame,
  Transfer,
  WithdrawTimeoutChanged,
} from '../../generated/templates/LPV2/LPV2'
import { bettorWin } from '../common/bets'
import { createEvent } from '../common/events'
import { cancelGame, createGame, shiftGame } from '../common/games'
import { changeWithdrawalTimeout, depositLiquidity, transferLiquidity, withdrawLiquidity } from '../common/pool'
import { getGameEntityId } from '../utils/schema'


export function handleNewGame(event: NewGame): void {
  createEvent(
    'NewGame',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'gameId',
    event.params.gameId.toString(),
  )

  createGame(
    event.address.toHexString(),
    event.params.gameId,
    event.params.gameId,
    event.params.ipfsHash,
    event.params.startsAt,
    event.transaction.hash.toHexString(),
    event.block,
  )
}

export function handleGameShifted(event: GameShifted): void {
  createEvent(
    'GameShifted',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'gameId',
    event.params.gameId.toString(),
  )

  const gameEntityId = getGameEntityId(event.address.toHexString(), event.params.gameId.toString())

  shiftGame(gameEntityId, event.params.newStart, event.transaction.hash.toHexString(), event.block)
}

export function handleGameCanceled(event: GameCanceled): void {
  createEvent(
    'GameCanceled',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'gameId',
    event.params.gameId.toString(),
  )

  const gameEntityId = getGameEntityId(event.address.toHexString(), event.params.gameId.toString())

  cancelGame(gameEntityId, event.transaction.hash.toHexString(), event.block)
}

export function handleBettorWin(event: BettorWin): void {
  createEvent(
    'BettorWin',
    event.params.core,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    'betId',
    event.params.tokenId.toString(),
  )

  const coreAddress = event.params.core.toHexString()

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

  const liquidityPoolSC = LPAbi.bind(event.address)
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
