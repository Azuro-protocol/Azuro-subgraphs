import { Address, BigInt, dataSource } from '@graphprotocol/graph-ts'

import {
  BettorWin,
  GameCanceled,
  GameShifted,
  LiquidityAdded,
  LiquidityManagerChanged,
  LiquidityRemoved,
  LPV2 as LPAbi,
  NewGame as NewGameV3,
  NewGame1 as NewGameV2,
  Transfer,
  WithdrawTimeoutChanged,
} from '../../generated/templates/LPV2/LPV2'
import { bettorWin } from '../common/bets'
import { createEvent } from '../common/events'
import { cancelGame, createGame, shiftGame } from '../common/games'
import {
  changeWithdrawalTimeout, depositLiquidity, transferLiquidity, updateLiquidityManager, withdrawLiquidity,
} from '../common/pool'
import { getGameEntityId } from '../utils/schema'


export function handleNewGameV2(event: NewGameV2): void {
  createEvent(
    'NewGame',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'gameId',
    event.params.gameId.toString(),
  )

  const network = dataSource.network()

  createGame(
    event.address.toHexString(),
    event.params.gameId,
    event.params.ipfsHash,
    null,
    event.params.startsAt,
    network,
    event.transaction.hash.toHexString(),
    event.block,
  )
}

export function handleNewGameV3(event: NewGameV3): void {
  createEvent(
    'NewGame',
    event.address,
    event.transaction.hash.toHexString(),
    event.transaction.index,
    event.logIndex,
    event.block,
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'gameId',
    event.params.gameId.toString(),
  )

  const network = dataSource.network()

  createGame(
    event.address.toHexString(),
    event.params.gameId,
    null,
    event.params.data,
    event.params.startsAt,
    network,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'depositId',
    event.params.depositId.toString(),
  )

  depositLiquidity(
    event.address.toHexString(),
    event.params.amount,
    event.params.depositId,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'depositId',
    event.params.depositId.toString(),
  )

  let isFullyWithdrawn = false

  const liquidityPoolSC = LPAbi.bind(event.address)
  const nodeWithdrawView = liquidityPoolSC.try_nodeWithdrawView(event.params.depositId)

  if (!nodeWithdrawView.reverted && nodeWithdrawView.value.equals(BigInt.zero())) {
    isFullyWithdrawn = true
  }

  withdrawLiquidity(
    event.address.toHexString(),
    event.params.amount,
    event.params.depositId,
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
    event.transaction.gasPrice,
    event.receipt !== null ? event.receipt!.gasUsed : null,
    'depositId',
    event.params.tokenId.toString(),
  )

  transferLiquidity(event.address.toHexString(), event.params.tokenId, event.params.to.toHexString())
}

export function handleWithdrawTimeoutChanged(event: WithdrawTimeoutChanged): void {
  changeWithdrawalTimeout(event.address.toHexString(), event.params.newWithdrawTimeout)
}

export function handleManagerChanged(event: LiquidityManagerChanged): void {

  let newAddress: string | null = null

  if (event.params.newLiquidityManager.notEqual(Address.zero())) {
    newAddress = event.params.newLiquidityManager.toHexString()
  }

  updateLiquidityManager(
    event.address.toHexString(),
    newAddress,
  )
}
